import {
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
    type Viewport,
    type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { DEFAULT_LINK, DEFAULT_PRECISION } from '../model/defaults';
import { canConnect, isNodeIdAvailable, nextFreeNodeId, pruneDanglingLinks } from '../model/graph';
import { EMPTY_SNAPSHOT, browserStorage, loadSnapshot, type EditorSnapshot } from '../model/persistence';
import { defaultRouting } from '../model/routing';
import { EMPTY_SCHEDULE, type Schedule } from '../model/schedule';
import { buildRouteHighlight, newStream, recomputeRoutes, routesTouchNodes, routesUseLinks } from '../model/streams';
import { runSchedulerWasm } from '../simulation/wasm';
import type {
    EdgeData,
    LinkId,
    NodeData,
    NodeKey,
    RouteHighlight,
    Selection,
    Stream,
    StreamId,
    StreamSpec,
} from '../model/types';

export type EditorNode = Node<NodeData, 'network'>;
/** React Flow makes `data` optional; the editor always sets it, so narrow the type and spare every consumer a fallback. */
export type EditorLink = Edge<EdgeData, 'link'> & { data: EdgeData };

export type RenameResult = { ok: true } | { ok: false; reason: 'empty' | 'duplicate' };

export interface EditorData {
    nodes: EditorNode[];
    edges: EditorLink[];
    streams: Stream[];
    selection: Selection | null;
    viewport: Viewport;
    routeHighlight: RouteHighlight;
    /** Derived from streams and links by the scheduler; drives packet playback. */
    schedule: Schedule;
}

export interface EditorActions {
    onNodesChange: (changes: NodeChange<EditorNode>[]) => void;
    onEdgesChange: (changes: EdgeChange<EditorLink>[]) => void;
    addNode: (position: XYPosition) => NodeKey;
    renameNode: (key: NodeKey, id: string) => RenameResult;
    updateNodeData: (key: NodeKey, patch: Partial<Pick<NodeData, 'precision'>>) => void;
    removeNode: (key: NodeKey) => void;
    connect: (connection: Connection) => boolean;
    updateLink: (id: LinkId, patch: Partial<EdgeData>) => void;
    removeLink: (id: LinkId) => void;
    addStream: () => StreamId;
    updateStream: (id: StreamId, patch: Partial<StreamSpec>) => void;
    removeStream: (id: StreamId) => void;
    select: (selection: Selection | null) => void;
    setViewport: (viewport: Viewport) => void;
    clearCanvas: () => void;
}

export type EditorState = EditorData & EditorActions;

// ─── Derivation helpers ──────────────────────────────────────────────────────

type Topology = Pick<EditorData, 'nodes' | 'edges' | 'streams' | 'selection'>;

/**
 * The schedule depends only on the streams and the links. Remember the last
 * input so a derivation with unchanged streams and links hands back the same
 * schedule object, and memos keyed on its identity stay warm.
 */
let lastSchedule: { streams: Stream[]; edges: EditorLink[]; schedule: Schedule } | null = null;

function scheduleFor(streams: Stream[], edges: EditorLink[]): Schedule {
    if (lastSchedule && lastSchedule.streams === streams && lastSchedule.edges === edges) return lastSchedule.schedule;

    const schedule = EMPTY_SCHEDULE;
    lastSchedule = { streams, edges, schedule };

    if (streams.length > 0) {
        void runSchedulerWasm(streams, edges).then((wasmSchedule) => {
            if (!lastSchedule || lastSchedule.streams !== streams || lastSchedule.edges !== edges) return;
            lastSchedule.schedule = wasmSchedule;
            const state = useEditorStore.getState();
            if (state.streams === streams && state.edges === edges) {
                useEditorStore.setState({ schedule: wasmSchedule });
            }
        });
    }

    return schedule;
}

/** Recomputes routes, the highlight and the schedule for a topology change, all inside one state update. */
function withRoutes<T extends Topology>(state: T): T & Pick<EditorData, 'streams' | 'routeHighlight' | 'schedule'> {
    const streams = recomputeRoutes(state.streams, state.nodes, state.edges, defaultRouting);
    return {
        ...state,
        streams,
        routeHighlight: buildRouteHighlight(state.selection, streams, state.edges),
        schedule: scheduleFor(streams, state.edges),
    };
}

/** Stream fields that feed routing or the schedule; other edits (name, latency bounds) skip the derivation. */
const SCHEDULE_FIELDS: readonly (keyof StreamSpec)[] = ['start_node', 'end_node', 'message_size', 'period_ns'];

function dropSelectionIf(selection: Selection | null, kind: Selection['kind'], removed: Set<string>): Selection | null {
    return selection && selection.kind === kind && removed.has(selection.id) ? null : selection;
}

function newId(): string {
    return crypto.randomUUID();
}

/** Builds the store's data fields from a persisted snapshot. */
export function dataFromSnapshot(snapshot: EditorSnapshot): EditorData {
    const nodes: EditorNode[] = snapshot.nodes.map((n) => ({
        id: n.id,
        type: 'network',
        position: n.position,
        data: n.data,
    }));
    const edges: EditorLink[] = snapshot.links.map((l) => ({
        id: l.id,
        type: 'link',
        source: l.source,
        target: l.target,
        sourceHandle: l.sourceHandle,
        targetHandle: l.targetHandle,
        data: l.data,
    }));
    const streams: Stream[] = snapshot.streams.map((s) => ({ ...s, route: [], status: 'missing-endpoint' }));
    return {
        ...withRoutes({ nodes, edges, streams, selection: null }),
        viewport: snapshot.viewport,
    };
}

/** Everything persistence needs, taken from the current state. */
export function snapshotOf(state: EditorData): EditorSnapshot {
    return {
        nodes: state.nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
        links: state.edges.map((l) => ({
            id: l.id,
            source: l.source,
            target: l.target,
            sourceHandle: l.sourceHandle ?? null,
            targetHandle: l.targetHandle ?? null,
            data: l.data,
        })),
        streams: state.streams,
        viewport: state.viewport,
    };
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()((set, get) => ({
    ...dataFromSnapshot(loadSnapshot(browserStorage())),

    onNodesChange: (changes) => {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
        const nodes = applyNodeChanges(changes, get().nodes);
        if (removed.size === 0) {
            set({ nodes });
            return;
        }
        const state = get();
        const edges = pruneDanglingLinks(nodes, state.edges);
        const removedLinks = new Set(state.edges.filter((e) => !edges.includes(e)).map((e) => e.id));
        const selection = dropSelectionIf(dropSelectionIf(state.selection, 'node', removed), 'link', removedLinks);
        // React Flow deletes a node's edges before the node itself; by the time the node
        // arrives its links are gone and routes were already recomputed, so only derive
        // again when this removal can still change a route.
        if (edges === state.edges && !routesTouchNodes(state.streams, removed)) {
            set({ nodes, selection });
            return;
        }
        set(withRoutes({ ...state, nodes, edges, selection }));
    },

    onEdgesChange: (changes) => {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
        const edges = applyEdgeChanges(changes, get().edges);
        if (removed.size === 0) {
            set({ edges });
            return;
        }
        const state = get();
        const selection = dropSelectionIf(state.selection, 'link', removed);
        // Removing a link no route travels cannot shorten or break any route
        if (!routesUseLinks(state.streams, state.edges.filter((e) => removed.has(e.id)))) {
            set({ edges, selection });
            return;
        }
        set(withRoutes({ ...state, edges, selection }));
    },

    addNode: (position) => {
        const key = newId();
        const nodes = get().nodes;
        const node: EditorNode = {
            id: key,
            type: 'network',
            position,
            data: { id: nextFreeNodeId(nodes), precision: DEFAULT_PRECISION },
        };
        set({ nodes: [...nodes, node] });
        return key;
    },

    renameNode: (key, id) => {
        const trimmed = id.trim();
        if (trimmed.length === 0) return { ok: false, reason: 'empty' };
        const nodes = get().nodes;
        if (!isNodeIdAvailable(nodes, trimmed, key)) return { ok: false, reason: 'duplicate' };
        set({ nodes: nodes.map((n) => (n.id === key ? { ...n, data: { ...n.data, id: trimmed } } : n)) });
        return { ok: true };
    },

    updateNodeData: (key, patch) => {
        set({ nodes: get().nodes.map((n) => (n.id === key ? { ...n, data: { ...n.data, ...patch } } : n)) });
    },

    removeNode: (key) => {
        get().onNodesChange([{ type: 'remove', id: key }]);
    },

    connect: (connection) => {
        const state = get();
        if (!canConnect(state.nodes, state.edges, connection.source, connection.target).ok) return false;
        const edge: EditorLink = {
            id: newId(),
            type: 'link',
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            data: { ...DEFAULT_LINK },
        };
        set(withRoutes({ ...state, edges: [...state.edges, edge] }));
        return true;
    },

    updateLink: (id, patch) => {
        // length / bandwidth feed the schedule, so derive like a topology change
        const state = get();
        const link = state.edges.find((e) => e.id === id);
        if (!link || (Object.keys(patch) as (keyof EdgeData)[]).every((k) => link.data[k] === patch[k])) return;
        const edges = state.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e));
        set(withRoutes({ ...state, edges }));
    },

    removeLink: (id) => {
        get().onEdgesChange([{ type: 'remove', id }]);
    },

    addStream: () => {
        const state = get();
        const stream = newStream(newId(), state.streams);
        const selection: Selection = { kind: 'stream', id: stream.id };
        set(withRoutes({ ...state, streams: [...state.streams, stream], selection }));
        return stream.id;
    },

    updateStream: (id, patch) => {
        const state = get();
        const streams = state.streams.map((s) => (s.id === id ? { ...s, ...patch } : s));
        if (SCHEDULE_FIELDS.some((field) => field in patch)) set(withRoutes({ ...state, streams }));
        else set({ streams });
    },

    removeStream: (id) => {
        const state = get();
        const streams = state.streams.filter((s) => s.id !== id);
        const selection = state.selection?.kind === 'stream' && state.selection.id === id ? null : state.selection;
        set(withRoutes({ ...state, streams, selection }));
    },

    select: (selection) => {
        const state = get();
        set({ selection, routeHighlight: buildRouteHighlight(selection, state.streams, state.edges) });
    },

    setViewport: (viewport) => set({ viewport }),

    clearCanvas: () => {
        set({ ...dataFromSnapshot(EMPTY_SNAPSHOT), viewport: get().viewport });
    },
}));
