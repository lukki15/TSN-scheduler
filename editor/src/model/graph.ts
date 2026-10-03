import { NODE_ID_PREFIX } from './defaults';
import type { GraphLink, GraphNode, LinkId, NodeKey } from './types';

/** Order-independent key for an undirected node pair. */
export function pairKey(a: NodeKey, b: NodeKey): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The link between `a` and `b` in either orientation, if any. */
export function findLink<L extends GraphLink>(links: readonly L[], a: NodeKey, b: NodeKey): L | undefined {
    const key = pairKey(a, b);
    return links.find((l) => pairKey(l.source, l.target) === key);
}

/** O(1) lookup of the link between two nodes, for callers that resolve many hops against the same links. */
export function indexLinks<L extends GraphLink>(links: readonly L[]): (a: NodeKey, b: NodeKey) => L | undefined {
    const byPair = new Map(links.map((l) => [pairKey(l.source, l.target), l]));
    return (a, b) => byPair.get(pairKey(a, b));
}

/** User-visible TSN id per node key. A plain record so React selectors can compare it shallowly. */
export function nodeDisplayIds(nodes: readonly GraphNode[]): Record<NodeKey, string> {
    return Object.fromEntries(nodes.map((n) => [n.id, n.data.id]));
}

export const UNKNOWN_NODE_LABEL = '?';

/** TSN id for a node key, `?` for a missing key or an unknown node. */
export function displayId(ids: Record<NodeKey, string>, key: NodeKey | null | undefined): string {
    return (key !== null && key !== undefined && ids[key]) || UNKNOWN_NODE_LABEL;
}

export type ConnectResult =
    | { ok: true }
    | { ok: false; reason: 'self' | 'duplicate' | 'unknown-node' };

/** Whether a new undirected link between `a` and `b` is allowed. */
export function canConnect(
    nodes: readonly GraphNode[],
    links: readonly GraphLink[],
    a: NodeKey,
    b: NodeKey,
): ConnectResult {
    if (a === b) return { ok: false, reason: 'self' };
    const known = new Set(nodes.map((n) => n.id));
    if (!known.has(a) || !known.has(b)) return { ok: false, reason: 'unknown-node' };
    if (findLink(links, a, b)) return { ok: false, reason: 'duplicate' };
    return { ok: true };
}

/** True when no node other than `exceptKey` already uses the TSN id `id`. */
export function isNodeIdAvailable(nodes: readonly GraphNode[], id: string, exceptKey?: NodeKey): boolean {
    return !nodes.some((n) => n.id !== exceptKey && n.data.id === id);
}

/** Smallest `${prefix}${n}` (n ≥ 1) not present in `taken`. Fills gaps left by deletions. */
export function nextFreeName(taken: Iterable<string>, prefix: string): string {
    const used = new Set(taken);
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
}

export function nextFreeNodeId(nodes: readonly GraphNode[], prefix: string = NODE_ID_PREFIX): string {
    return nextFreeName(nodes.map((n) => n.data.id), prefix);
}

export type Adjacency = Map<NodeKey, { neighbor: NodeKey; linkId: LinkId }[]>;

/**
 * Undirected adjacency list. Every node gets an entry (possibly empty); links
 * referencing unknown nodes are skipped. Neighbor lists are ordered by node
 * position in `nodes` so traversal order is deterministic regardless of the
 * order in which links were created.
 */
export function buildAdjacency(nodes: readonly GraphNode[], links: readonly GraphLink[]): Adjacency {
    const index = new Map<NodeKey, number>();
    const adjacency: Adjacency = new Map();
    nodes.forEach((n, i) => {
        index.set(n.id, i);
        adjacency.set(n.id, []);
    });
    for (const l of links) {
        if (!index.has(l.source) || !index.has(l.target)) continue;
        adjacency.get(l.source)!.push({ neighbor: l.target, linkId: l.id });
        adjacency.get(l.target)!.push({ neighbor: l.source, linkId: l.id });
    }
    for (const list of adjacency.values()) {
        list.sort((x, y) => index.get(x.neighbor)! - index.get(y.neighbor)!);
    }
    return adjacency;
}

/** Drops links whose endpoints no longer exist. Returns the input array when nothing was dropped. */
export function pruneDanglingLinks<L extends GraphLink>(nodes: readonly GraphNode[], links: L[]): L[] {
    const known = new Set(nodes.map((n) => n.id));
    const kept = links.filter((l) => known.has(l.source) && known.has(l.target));
    return kept.length === links.length ? links : kept;
}
