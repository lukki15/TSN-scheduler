import { randomHue } from './colors';
import { DEFAULT_STREAM, STREAM_NAME_PREFIX } from './defaults';
import { buildAdjacency, indexLinks, nextFreeName, pairKey } from './graph';
import type { RoutingStrategy } from './routing';
import type {
    GraphLink,
    GraphNode,
    LinkDirection,
    LinkId,
    NodeKey,
    RouteHighlight,
    RouteStatus,
    Selection,
    Stream,
    StreamId,
} from './types';

/** A fresh stream with default attributes, no endpoints, a random color and the next free name. */
export function newStream(id: StreamId, existing: readonly Stream[], hue: number = randomHue()): Stream {
    return {
        id,
        hue,
        name: nextFreeName(existing.map((s) => s.name), STREAM_NAME_PREFIX),
        ...DEFAULT_STREAM,
        start_node: null,
        end_node: null,
        route: [],
        status: 'missing-endpoint',
    };
}

function sameRoute(a: readonly NodeKey[], b: readonly NodeKey[]): boolean {
    return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * Recomputes `route` and `status` of every stream against the current graph.
 * Streams are never removed. Returns the same stream object when its result is
 * unchanged, and the same array when no stream changed, so callers and React
 * can rely on reference equality.
 */
export function recomputeRoutes(
    streams: Stream[],
    nodes: readonly GraphNode[],
    links: readonly GraphLink[],
    strategy: RoutingStrategy,
): Stream[] {
    const known = new Set(nodes.map((n) => n.id));
    const adjacency = buildAdjacency(nodes, links);
    let changed = false;

    const next = streams.map((stream) => {
        let status: RouteStatus;
        let route: NodeKey[] = [];
        const { start_node, end_node } = stream;

        if (start_node === null || end_node === null || !known.has(start_node) || !known.has(end_node)) {
            status = 'missing-endpoint';
        } else if (start_node === end_node) {
            status = 'same-endpoint';
        } else {
            const path = strategy.route(adjacency, start_node, end_node);
            if (path === null) {
                status = 'unreachable';
            } else {
                status = 'ok';
                route = path;
            }
        }

        if (status === stream.status && sameRoute(route, stream.route)) return stream;
        changed = true;
        return { ...stream, status, route };
    });

    return changed ? next : streams;
}

/** The links a route traverses, with the direction of travel relative to each link's source → target. */
export function routeLinks(
    route: readonly NodeKey[],
    links: readonly GraphLink[],
): { linkId: LinkId; direction: LinkDirection }[] {
    const result: { linkId: LinkId; direction: LinkDirection }[] = [];
    const linkBetween = indexLinks(links);
    for (let i = 0; i + 1 < route.length; i++) {
        const link = linkBetween(route[i], route[i + 1]);
        if (!link) continue;
        result.push({ linkId: link.id, direction: link.source === route[i] ? 'forward' : 'reverse' });
    }
    return result;
}

/** Id of the selected stream, `null` when the selection is something else. */
export function selectedStreamId(selection: Selection | null): StreamId | null {
    return selection?.kind === 'stream' ? selection.id : null;
}

/** The selected stream, `undefined` when the selection is something else or the stream is gone. */
export function selectedStream(selection: Selection | null, streams: readonly Stream[]): Stream | undefined {
    const id = selectedStreamId(selection);
    return id === null ? undefined : streams.find((s) => s.id === id);
}

/** True when a stream starts, ends or passes through one of `keys`. */
export function routesTouchNodes(streams: readonly Stream[], keys: ReadonlySet<NodeKey>): boolean {
    return streams.some(
        (s) =>
            (s.start_node !== null && keys.has(s.start_node)) ||
            (s.end_node !== null && keys.has(s.end_node)) ||
            s.route.some((k) => keys.has(k)),
    );
}

/** True when any stream's route travels one of `links` (consecutive route nodes equal the link's endpoints). */
export function routesUseLinks(streams: readonly Stream[], links: readonly GraphLink[]): boolean {
    if (links.length === 0) return false;
    const keys = new Set(links.map((l) => pairKey(l.source, l.target)));
    return streams.some((s) => {
        for (let i = 0; i + 1 < s.route.length; i++) {
            if (keys.has(pairKey(s.route[i], s.route[i + 1]))) return true;
        }
        return false;
    });
}

export function hueByStream(streams: readonly Stream[]): Map<StreamId, number> {
    return new Map(streams.map((s) => [s.id, s.hue]));
}

export const EMPTY_HIGHLIGHT: RouteHighlight = Object.freeze({ hue: null, nodes: {}, links: {} }) as RouteHighlight;

/** Highlight for the selected stream's route; `EMPTY_HIGHLIGHT` (same reference) when nothing applies. */
export function buildRouteHighlight(
    selection: Selection | null,
    streams: readonly Stream[],
    links: readonly GraphLink[],
): RouteHighlight {
    const stream = selectedStream(selection, streams);
    if (!stream || stream.status !== 'ok') return EMPTY_HIGHLIGHT;

    const highlight: RouteHighlight = { hue: stream.hue, nodes: {}, links: {} };
    for (const key of stream.route) highlight.nodes[key] = true;
    for (const { linkId, direction } of routeLinks(stream.route, links)) highlight.links[linkId] = direction;
    return highlight;
}
