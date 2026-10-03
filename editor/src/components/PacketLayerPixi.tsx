import { memo, useCallback, useEffect, useRef, type RefObject } from 'react';
import { Application, useApplication, useTick } from '@pixi/react';
import { Color, Container, Sprite, Texture, type Application as PixiApplication } from 'pixi.js';
import { useStoreApi, type InternalNode } from '@xyflow/react';
import { cubicAt, cubicNormalAt, edgeGeometry, type AnchorHandle, type AnchorNode, type Cubic, type Side } from '../model/bezier';
import { hueToCss } from '../model/colors';
import { linkSources } from '../model/graph';
import { buildLanes, packetsAt } from '../model/packets';
import { timeAt, type Playback } from '../model/playback';
import type { Schedule } from '../model/schedule';
import { hueByStream, selectedStreamId } from '../model/streams';
import type { LinkId, NodeKey, Selection, Stream, StreamId } from '../model/types';
import { useEditorStore, type EditorLink, type EditorNode } from '../store/editorStore';
import { usePlaybackStore } from '../store/playbackStore';

const PACKET_SIZE = 14;
const PACKET_SIZE_SELECTED = 20;
const TEXTURE_SIZE = 128;

// ─── Imperative scene (plain objects, no React) ──────────────────────────────

interface Scene {
    layer: Container;
    texture: Texture;
    pool: Sprite[];
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

/** White filled circle with a soft dark rim; tinted per stream. Same construction as ArchAlive's packet textures. */
function createPacketTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.stroke();
    return Texture.from(canvas);
}

function createScene(app: PixiApplication): Scene {
    const layer = new Container();
    app.stage.addChild(layer);
    return {
        layer,
        texture: createPacketTexture(),
        pool: [],
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
        scene.texture.destroy(true);
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

function hideFrom(pool: Sprite[], index: number) {
    for (let i = index; i < pool.length; i++) pool[i].visible = false;
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

/** Places one sprite per in-flight packet exactly on the drawn edge, offset into its lane. */
function renderFrame(scene: Scene, input: FrameInput) {
    const { layer, pool } = scene;
    layer.position.set(input.transform[0], input.transform[1]);
    layer.scale.set(input.transform[2]);

    if (input.playback.status === 'stopped') {
        hideFrom(pool, 0);
        return;
    }

    if (scene.edgesFor !== input.edges) {
        scene.edgesFor = input.edges;
        scene.edgeLookup = new Map(input.edges.map((e) => [e.id, e]));
        scene.sourceOf = linkSources(input.edges);
    }
    const packets = packetsAt(input.schedule, timeAt(input.playback, input.nowMs), scene.sourceOf);
    if (packets.length === 0) {
        hideFrom(pool, 0);
        return;
    }

    if (scene.lanesFor !== input.schedule) {
        scene.lanesFor = input.schedule;
        scene.lanes = buildLanes(input.schedule);
    }
    if (scene.streamsFor !== input.streams) {
        scene.streamsFor = input.streams;
        scene.hueOf = hueByStream(input.streams);
    }

    const selectedId = selectedStreamId(input.selection);
    const geometry = new Map<LinkId, Cubic>();

    let used = 0;
    for (const p of packets) {
        const edge = scene.edgeLookup.get(p.link_id);
        if (!edge) continue;

        let cubic = geometry.get(p.link_id);
        if (!cubic) {
            const source = input.nodeLookup.get(edge.source);
            const target = input.nodeLookup.get(edge.target);
            if (!source || !target) continue;
            cubic = edgeGeometry(toAnchorNode(source), edge.sourceHandle, toAnchorNode(target), edge.targetHandle);
            geometry.set(p.link_id, cubic);
        }

        const u = p.direction === 'forward' ? p.progress : 1 - p.progress;
        const pos = cubicAt(cubic, u);
        const normal = cubicNormalAt(cubic, u);
        const lane = scene.lanes.get(p.link_id)?.get(p.stream_id) ?? 0;

        let sprite = pool[used];
        if (!sprite) {
            sprite = new Sprite(scene.texture);
            sprite.anchor.set(0.5);
            layer.addChild(sprite);
            pool.push(sprite);
        }
        used++;

        const hue = scene.hueOf.get(p.stream_id) ?? 0;
        let tint = scene.tints.get(hue);
        if (tint === undefined) {
            tint = new Color(hueToCss(hue)).toNumber();
            scene.tints.set(hue, tint);
        }

        const size = p.stream_id === selectedId ? PACKET_SIZE_SELECTED : PACKET_SIZE;
        sprite.visible = true;
        sprite.position.set(pos.x + normal.x * lane, pos.y + normal.y * lane);
        sprite.width = size;
        sprite.height = size;
        sprite.tint = tint;
        sprite.alpha = 1;
    }
    hideFrom(pool, used);
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
function PacketTicker() {
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

/** Transparent GPU layer over the React Flow canvas that animates scheduled packets. */
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
            <PacketTicker />
        </Application>
    );
});
