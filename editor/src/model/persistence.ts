import { hueFromId } from './colors';
import { DEFAULT_LINK, DEFAULT_PRECISION, DEFAULT_STREAM } from './defaults';
import type { EdgeData, LinkId, NodeData, NodeKey, StreamId, StreamSpec } from './types';

export const STORAGE_KEY = 'tsn_editor_state';
export const SCHEMA_VERSION = 1;

export interface EditorViewport {
    x: number;
    y: number;
    zoom: number;
}

export const DEFAULT_VIEWPORT: EditorViewport = { x: 0, y: 0, zoom: 0.8 };

export interface PersistedNode {
    id: NodeKey;
    position: { x: number; y: number };
    data: NodeData;
}

export interface PersistedLink {
    id: LinkId;
    source: NodeKey;
    target: NodeKey;
    sourceHandle: string | null;
    targetHandle: string | null;
    data: EdgeData;
}

export type PersistedStream = StreamSpec & { id: StreamId; hue: number };

/** Everything the editor needs to restore a session. Routes are recomputed, not stored. */
export interface EditorSnapshot {
    nodes: PersistedNode[];
    links: PersistedLink[];
    streams: PersistedStream[];
    viewport: EditorViewport;
}

export interface PersistedStateV1 extends EditorSnapshot {
    version: 1;
}

export const EMPTY_SNAPSHOT: EditorSnapshot = Object.freeze({
    nodes: [],
    links: [],
    streams: [],
    viewport: DEFAULT_VIEWPORT,
}) as EditorSnapshot;

/** Minimal storage contract so tests can inject a fake instead of `localStorage`. */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

// ─── Serialize ───────────────────────────────────────────────────────────────

/** Whitelists persisted fields; transient React Flow state (selected, measured, dragging) is dropped. */
export function serialize(snapshot: EditorSnapshot): string {
    const state: PersistedStateV1 = {
        version: 1,
        nodes: snapshot.nodes.map((n) => ({
            id: n.id,
            position: { x: n.position.x, y: n.position.y },
            data: { id: n.data.id, precision: n.data.precision },
        })),
        links: snapshot.links.map((l) => ({
            id: l.id,
            source: l.source,
            target: l.target,
            sourceHandle: l.sourceHandle,
            targetHandle: l.targetHandle,
            data: { length: l.data.length, bandwidth: l.data.bandwidth },
        })),
        streams: snapshot.streams.map((s) => ({
            id: s.id,
            hue: s.hue,
            name: s.name,
            message_size: s.message_size,
            period_ns: s.period_ns,
            e2e_latency_ns: s.e2e_latency_ns,
            max_jitter_ns: s.max_jitter_ns,
            start_node: s.start_node,
            end_node: s.end_node,
        })),
        viewport: { x: snapshot.viewport.x, y: snapshot.viewport.y, zoom: snapshot.viewport.zoom },
    };
    return JSON.stringify(state);
}

// ─── Deserialize ─────────────────────────────────────────────────────────────

type Unknown = Record<string, unknown>;

function isRecord(v: unknown): v is Unknown {
    return typeof v === 'object' && v !== null;
}

function num(v: unknown, fallback: number): number {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function readNode(v: unknown): PersistedNode | null {
    if (!isRecord(v)) return null;
    const id = str(v.id);
    if (!id || !isRecord(v.data)) return null;
    const pos = isRecord(v.position) ? v.position : {};
    return {
        id,
        position: { x: num(pos.x, 0), y: num(pos.y, 0) },
        data: { id: str(v.data.id) ?? id, precision: num(v.data.precision, DEFAULT_PRECISION) },
    };
}

function readLink(v: unknown): PersistedLink | null {
    if (!isRecord(v)) return null;
    const id = str(v.id);
    const source = str(v.source);
    const target = str(v.target);
    if (!id || !source || !target) return null;
    const data = isRecord(v.data) ? v.data : {};
    return {
        id,
        source,
        target,
        sourceHandle: str(v.sourceHandle),
        targetHandle: str(v.targetHandle),
        data: { length: num(data.length, DEFAULT_LINK.length), bandwidth: num(data.bandwidth, DEFAULT_LINK.bandwidth) },
    };
}

function readStream(v: unknown): PersistedStream | null {
    if (!isRecord(v)) return null;
    const id = str(v.id);
    if (!id) return null;
    return {
        id,
        hue: ((num(v.hue, hueFromId(id)) % 360) + 360) % 360,
        name: str(v.name) ?? id,
        message_size: num(v.message_size, DEFAULT_STREAM.message_size),
        period_ns: num(v.period_ns, DEFAULT_STREAM.period_ns),
        e2e_latency_ns: num(v.e2e_latency_ns, DEFAULT_STREAM.e2e_latency_ns),
        max_jitter_ns: num(v.max_jitter_ns, DEFAULT_STREAM.max_jitter_ns),
        start_node: str(v.start_node),
        end_node: str(v.end_node),
    };
}

/**
 * Parses a persisted document. Returns `null` for unparsable input or a
 * different schema version. Links with unknown endpoints are dropped and stream
 * endpoints pointing at unknown nodes are cleared; routes are left for the
 * store to recompute.
 */
export function deserialize(raw: string): EditorSnapshot | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return null;

    const nodes = (Array.isArray(parsed.nodes) ? parsed.nodes : []).map(readNode).filter((n): n is PersistedNode => n !== null);
    const known = new Set(nodes.map((n) => n.id));

    const links = (Array.isArray(parsed.links) ? parsed.links : [])
        .map(readLink)
        .filter((l): l is PersistedLink => l !== null && known.has(l.source) && known.has(l.target));

    const streams = (Array.isArray(parsed.streams) ? parsed.streams : [])
        .map(readStream)
        .filter((s): s is PersistedStream => s !== null)
        .map((s) => ({
            ...s,
            start_node: s.start_node !== null && known.has(s.start_node) ? s.start_node : null,
            end_node: s.end_node !== null && known.has(s.end_node) ? s.end_node : null,
        }));

    const vp = isRecord(parsed.viewport) ? parsed.viewport : {};
    const viewport: EditorViewport = {
        x: num(vp.x, DEFAULT_VIEWPORT.x),
        y: num(vp.y, DEFAULT_VIEWPORT.y),
        zoom: num(vp.zoom, DEFAULT_VIEWPORT.zoom),
    };

    return { nodes, links, streams, viewport };
}

// ─── Storage access ──────────────────────────────────────────────────────────

/**
 * Reads a stored value through `parse`; missing storage, a missing key, a
 * throwing storage or a `parse` returning `null` all yield `fallback`.
 */
export function readPref<T>(storage: StorageLike | undefined, key: string, parse: (raw: string) => T | null, fallback: T): T {
    if (!storage) return fallback;
    try {
        const raw = storage.getItem(key);
        return raw === null ? fallback : (parse(raw) ?? fallback);
    } catch {
        return fallback;
    }
}

/** Reads the saved snapshot; any failure (no storage, quota, corrupt data) yields `EMPTY_SNAPSHOT`. */
export function loadSnapshot(storage: StorageLike | undefined): EditorSnapshot {
    return readPref(storage, STORAGE_KEY, deserialize, EMPTY_SNAPSHOT);
}

/** Writes an already serialized document. Returns `false` when storage rejected it. */
export function writeSnapshot(storage: StorageLike, json: string): boolean {
    try {
        storage.setItem(STORAGE_KEY, json);
        return true;
    } catch (e) {
        console.error('[Persistence] Failed to save state:', e);
        return false;
    }
}
