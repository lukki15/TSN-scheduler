/**
 * Editor data model.
 *
 * The first block mirrors the Rust types in
 * network-scheduler/crates/scheduler-core/src/types.rs field by field so a
 * GraphML / streams.json serializer can be added later without reshaping the UI.
 * The second block holds editor-only concepts (stable keys, selection, routes).
 *
 * Type aliases (not interfaces) are used for node/edge data because React Flow
 * expects data objects shaped like `Record<string, unknown>`.
 */

// ─── Rust mirrors ────────────────────────────────────────────────────────────

/** Rust `NodeData { id: NodeId, precision: f64 }`. `id` is the user-visible TSN node id. */
export type NodeData = {
    id: string;
    precision: number;
};

/** Rust `EdgeData { id: Option<String>, length: f64, bandwidth: f64 }`. */
export type EdgeData = {
    id?: string;
    length: number;
    bandwidth: number;
};

/**
 * Rust `Stream` minus the computed route. `start_node` / `end_node` hold editor
 * node keys (see `NodeKey`); the future serializer maps them to TSN ids.
 */
export type StreamSpec = {
    name: string;
    message_size: number;
    period_ns: number;
    e2e_latency_ns: number;
    max_jitter_ns: number;
    start_node: NodeKey | null;
    end_node: NodeKey | null;
};

// ─── Editor-only ─────────────────────────────────────────────────────────────

/** Stable internal node key (React Flow `node.id`). Never shown to the user. */
export type NodeKey = string;
export type LinkId = string;
export type StreamId = string;

export type RouteStatus = 'ok' | 'missing-endpoint' | 'same-endpoint' | 'unreachable';

export type Stream = StreamSpec & {
    id: StreamId;
    /** Display hue 0..359, assigned at creation and persisted. */
    hue: number;
    /** Computed node path from start to end, empty unless `status === 'ok'`. */
    route: NodeKey[];
    status: RouteStatus;
};

/** Structural view of a React Flow node; `Node<NodeData>` satisfies it. */
export interface GraphNode {
    id: NodeKey;
    data: NodeData;
}

/** Structural view of a React Flow edge with its data present (the editor never creates one without). Links are undirected. */
export interface GraphLink {
    id: LinkId;
    source: NodeKey;
    target: NodeKey;
    data: EdgeData;
}

export type LinkDirection = 'forward' | 'reverse';

export interface RouteHighlight {
    /** Hue of the highlighted stream, `null` when nothing is highlighted. */
    hue: number | null;
    nodes: Record<NodeKey, true>;
    /** `'forward'` when the stream travels source → target of the link, else `'reverse'`. */
    links: Record<LinkId, LinkDirection>;
}

export type Selection =
    | { kind: 'node'; id: NodeKey }
    | { kind: 'link'; id: LinkId }
    | { kind: 'stream'; id: StreamId };
