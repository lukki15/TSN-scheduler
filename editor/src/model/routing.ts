import type { Adjacency } from './graph';
import type { NodeKey } from './types';

/**
 * Pluggable route computation. The editor only ever asks for a path between
 * two nodes over the current adjacency; swapping the strategy (e.g. for a
 * non-crossing or load-aware router) requires no UI changes.
 */
export interface RoutingStrategy {
    readonly name: string;
    /** Node path from `from` to `to` inclusive, or `null` when unreachable. */
    route(adjacency: Adjacency, from: NodeKey, to: NodeKey): NodeKey[] | null;
}

/**
 * Breadth-first search by hop count. Ties between equal-length paths are broken
 * by neighbor order in the adjacency list (node creation order), so the result
 * is deterministic for a given graph.
 */
export const shortestPathRouting: RoutingStrategy = {
    name: 'shortest-path',
    route(adjacency, from, to) {
        if (!adjacency.has(from) || !adjacency.has(to)) return null;
        if (from === to) return [from];

        const previous = new Map<NodeKey, NodeKey | null>([[from, null]]);
        const queue: NodeKey[] = [from];

        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            for (const { neighbor } of adjacency.get(current) ?? []) {
                if (previous.has(neighbor)) continue;
                previous.set(neighbor, current);
                if (neighbor === to) {
                    const path: NodeKey[] = [];
                    for (let at: NodeKey | null = to; at !== null; at = previous.get(at) ?? null) {
                        path.push(at);
                    }
                    return path.reverse();
                }
                queue.push(neighbor);
            }
        }
        return null;
    },
};

export const defaultRouting: RoutingStrategy = shortestPathRouting;
