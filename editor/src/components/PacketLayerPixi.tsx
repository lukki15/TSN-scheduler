import { memo, useCallback, useEffect, useRef, type RefObject } from 'react';
import { Application, useApplication, useTick } from '@pixi/react';
import { Color, Container, Graphics, type Application as PixiApplication } from 'pixi.js';
import { useStoreApi, type InternalNode } from '@xyflow/react';
import { cubicAt, cubicNormalAt, edgeGeometry, type AnchorHandle, type AnchorNode, type Cubic, type Point, type Side } from '../model/bezier';
import { hueToCss } from '../model/colors';
import { linkSources } from '../model/graph';
import { buildLanes, packetsAt } from '../model/packets';
import { timeAt, type Playback } from '../model/playback';
import type { Schedule } from '../model/schedule';
import { hueByStream, selectedStreamId } from '../model/streams';
import type { LinkId, NodeKey, Selection, Stream, StreamId } from '../model/types';
import { useEditorStore, type EditorLink, type EditorNode } from '../store/editorStore';
import { usePlaybackStore } from '../store/playbackStore';

/** Bar thickness in flow px (the dots were 14 px wide). */
const BAR_WIDTH = 8;
const BAR_WIDTH_SELECTED = 12;
/** Frames shorter than this on screen are stretched so they stay visible. */
const MIN_BAR_LENGTH = 24;
/** Polyline samples per unit of bezier parameter when tracing a bar. */
const SAMPLES_PER_UNIT = 32;
/** Other streams fade back while one stream is selected. */
const DIMMED_ALPHA = 0.55;
/** A frame still leaving its sender is drawn slightly translucent. */
const TX_ALPHA = 0.8;
/** Packets fade in over the first part of their route, like ArchAlive's client fade-in. */
const FADE_IN_ROUTE_PROGRESS = 0.1;

// ─── Imperative scene (plain objects, no React) ──────────────────────────────

interface Scene {
    layer: Container;
    /** All bars of a frame are drawn into this one graphics object and cleared every tick. */
    graphics: Graphics;
    tints: Map<number, number>;
    /** Lookups derived from store arrays, rebuilt only when the array reference changes. */
    lanesFor: Schedule | null;
    lanes: Map<LinkId, Map<StreamId, number>>;
    edgesFor: EditorLink[] | null;
    edgeLookup: Map<LinkId, EditorLink>;
    sourceOf: Map<LinkId, NodeKey>;
    streamsFor: Stream[] | null;
    hueOf: Map<StreamId, number>;
}

function createScene(app: PixiApplication): Scene {
    const layer = new Container();
    const graphics = new Graphics();
    layer.addChild(graphics);
    app.stage.addChild(layer);
    return {
        layer,
        graphics,
        tints: new Map(),
        lanesFor: null,
        lanes: new Map(),
        edgesFor: null,
        edgeLookup: new Map(),
        sourceOf: new Map(),
        streamsFor: null,
        hueOf: new Map(),
    };
}

function destroyScene(app: PixiApplication, scene: Scene) {
    try {
        if (app.stage) app.stage.removeChild(scene.layer);
        scene.layer.destroy({ children: true });
    } catch {
        // the application may already be destroyed during teardown
    }
}

function toAnchorNode(node: InternalNode<EditorNode>): AnchorNode {
    const handles: AnchorHandle[] = (node.internals.handleBounds?.source ?? []).map((h) => ({
        id: h.id,
        x: h.x,
        y: h.y,
        width: h.width,
        height: h.height,
        position: h.position as Side,
    }));
    return {
        positionAbsolute: node.internals.positionAbsolute,
        width: node.measured.width ?? 0,
        height: node.measured.height ?? 0,
        handles,
    };
}

interface LinkGeometry {
    cubic: Cubic;
    /** Approximate arc length in flow px, for the minimum visible bar length. */
    length: number;
}

function approximateLength(cubic: Cubic): number {
    let length = 0;
    let prev = cubicAt(cubic, 0);
    for (let i = 1; i <= 16; i++) {
        const next = cubicAt(cubic, i / 16);
        length += Math.hypot(next.x - prev.x, next.y - prev.y);
        prev = next;
    }
    return length;
}

/** Point on the curve shifted into the lane along the local normal. */
function lanePoint(cubic: Cubic, u: number, lane: number): Point {
    const pos = cubicAt(cubic, u);
    if (lane === 0) return pos;
    const n = cubicNormalAt(cubic, u);
    return { x: pos.x + n.x * lane, y: pos.y + n.y * lane };
}

/**
 * Traces the bar between parameters `u0` and `u1` (either order) as a polyline
 * and strokes it. Short bars are stretched to MIN_BAR_LENGTH around their centre.
 */
function strokeBar(g: Graphics, geometry: LinkGeometry, u0: number, u1: number, lane: number, width: number, color: number, alpha: number) {
    let a = Math.min(u0, u1);
    let b = Math.max(u0, u1);
    const minSpan = geometry.length > 0 ? Math.min(1, MIN_BAR_LENGTH / geometry.length) : 0;
    if (b - a < minSpan) {
        const center = (a + b) / 2;
        a = center - minSpan / 2;
        b = center + minSpan / 2;
        if (a < 0) { b -= a; a = 0; }
        if (b > 1) { a -= b - 1; b = 1; }
    }

    const steps = Math.max(2, Math.ceil((b - a) * SAMPLES_PER_UNIT));
    const first = lanePoint(geometry.cubic, a, lane);
    g.beginPath();
    g.moveTo(first.x, first.y);
    for (let i = 1; i <= steps; i++) {
        const p = lanePoint(geometry.cubic, a + ((b - a) * i) / steps, lane);
        g.lineTo(p.x, p.y);
    }
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

interface FrameInput {
    transform: [number, number, number];
    nodeLookup: Map<string, InternalNode<EditorNode>>;
    playback: Playback;
    nowMs: number;
    schedule: Schedule;
    edges: EditorLink[];
    streams: Stream[];
    selection: Selection | null;
}

/**
 * Draws one bar per in-flight frame, spanning the link from the frame's last
 * bit (tail) to its first bit (head), exactly on the drawn edge and offset into
 * the stream's lane.
 */
function renderFrame(scene: Scene, input: FrameInput) {
    const { layer, graphics } = scene;
    layer.position.set(input.transform[0], input.transform[1]);
    layer.scale.set(input.transform[2]);
    graphics.clear();

    if (input.playback.status === 'stopped') return;

    if (scene.edgesFor !== input.edges) {
        scene.edgesFor = input.edges;
        scene.edgeLookup = new Map(input.edges.map((e) => [e.id, e]));
        scene.sourceOf = linkSources(input.edges);
    }
    const packets = packetsAt(input.schedule, timeAt(input.playback, input.nowMs), scene.sourceOf);
    if (packets.length === 0) return;

    if (scene.lanesFor !== input.schedule) {
        scene.lanesFor = input.schedule;
        scene.lanes = buildLanes(input.schedule);
    }
    if (scene.streamsFor !== input.streams) {
        scene.streamsFor = input.streams;
        scene.hueOf = hueByStream(input.streams);
    }

    const selectedId = selectedStreamId(input.selection);
    const geometries = new Map<LinkId, LinkGeometry>();

    for (const p of packets) {
        const edge = scene.edgeLookup.get(p.link_id);
        if (!edge) continue;

        let geometry = geometries.get(p.link_id);
        if (!geometry) {
            const source = input.nodeLookup.get(edge.source);
            const target = input.nodeLookup.get(edge.target);
            if (!source || !target) continue;
            const cubic = edgeGeometry(toAnchorNode(source), edge.sourceHandle, toAnchorNode(target), edge.targetHandle);
            geometry = { cubic, length: approximateLength(cubic) };
            geometries.set(p.link_id, geometry);
        }

        // head/tail are measured from → to; the cubic runs source → target
        const uHead = p.direction === 'forward' ? p.head : 1 - p.head;
        const uTail = p.direction === 'forward' ? p.tail : 1 - p.tail;
        const lane = scene.lanes.get(p.link_id)?.get(p.stream_id) ?? 0;

        const hue = scene.hueOf.get(p.stream_id) ?? 0;
        let color = scene.tints.get(hue);
        if (color === undefined) {
            color = new Color(hueToCss(hue)).toNumber();
            scene.tints.set(hue, color);
        }

        const emphasized = p.stream_id === selectedId;
        let alpha = selectedId !== null && !emphasized ? DIMMED_ALPHA : 1;
        if (p.phase === 'tx') alpha *= TX_ALPHA;
        if (p.routeProgress < FADE_IN_ROUTE_PROGRESS) alpha *= p.routeProgress / FADE_IN_ROUTE_PROGRESS;

        strokeBar(graphics, geometry, uTail, uHead, lane, emphasized ? BAR_WIDTH_SELECTED : BAR_WIDTH, color, alpha);
    }
}

// ─── React glue ──────────────────────────────────────────────────────────────

/**
 * Owns the scene for the lifetime of the Pixi application. While playing, a
 * frame is rendered on every ticker tick; all inputs are read from stores
 * inside the tick, so playback never causes React re-renders. While paused or
 * stopped the ticker (and with it Pixi's render pass) is off and a single frame
 * is rendered on demand whenever the editor state, the viewport or the clock
 * changes, so an idle editor costs nothing per frame.
 */
function PacketTicker({ resizeTo }: PacketLayerPixiProps) {
    const { app, isInitialised } = useApplication();
    const flow = useStoreApi<EditorNode, EditorLink>();
    const sceneRef = useRef<Scene | null>(null);

    useEffect(() => {
        if (!isInitialised || !app?.stage) return;
        const scene = createScene(app);
        sceneRef.current = scene;
        return () => {
            sceneRef.current = null;
            destroyScene(app, scene);
        };
    }, [app, isInitialised]);

    const tick = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        const { transform, nodeLookup } = flow.getState();
        const { schedule, edges, streams, selection } = useEditorStore.getState();
        renderFrame(scene, {
            transform,
            nodeLookup,
            playback: usePlaybackStore.getState(),
            nowMs: performance.now(),
            schedule,
            edges,
            streams,
            selection,
        });
    }, [flow]);

    useTick(tick);

    const renderOnce = useCallback(() => {
        tick();
        app.render();
    }, [app, tick]);

    // Pixi's resizeTo plugin only reacts to window resize events; the wrapper
    // also changes size when the timeline dock is resized or collapsed. Resizing
    // clears the canvas, so redraw when the ticker is not running.
    useEffect(() => {
        const el = resizeTo.current;
        if (!isInitialised || !el) return;
        const observer = new ResizeObserver(() => {
            app.resize();
            if (!app.ticker.started) renderOnce();
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [app, isInitialised, resizeTo, renderOnce]);

    useEffect(() => {
        if (!isInitialised) return;
        const renderIfIdle = () => {
            if (!app.ticker.started) renderOnce();
        };
        const sync = () => {
            if (usePlaybackStore.getState().status === 'playing') {
                if (!app.ticker.started) app.ticker.start();
            } else {
                if (app.ticker.started) app.ticker.stop();
                renderOnce();
            }
        };
        sync();
        const unsubscribe = [
            usePlaybackStore.subscribe(sync), // play/pause/stop, seeks and scale changes
            useEditorStore.subscribe(renderIfIdle), // edits, selection and node drags while paused
            flow.subscribe(renderIfIdle), // pan, zoom and node measurements while paused
        ];
        return () => unsubscribe.forEach((u) => u());
    }, [app, flow, isInitialised, renderOnce]);

    return null;
}

export interface PacketLayerPixiProps {
    /** Element whose size the transparent canvas follows (the canvas wrapper). */
    resizeTo: RefObject<HTMLDivElement | null>;
}

/** Transparent GPU layer over the React Flow canvas that animates scheduled frames as bars along the links. */
export const PacketLayerPixi = memo(function PacketLayerPixi({ resizeTo }: PacketLayerPixiProps) {
    return (
        <Application
            resizeTo={resizeTo}
            backgroundAlpha={0}
            antialias
            resolution={window.devicePixelRatio || 1}
            autoDensity
            className="absolute top-0 left-0 z-[50] pointer-events-none"
        >
            <PacketTicker resizeTo={resizeTo} />
        </Application>
    );
});
