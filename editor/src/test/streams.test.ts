import { describe, expect, it } from 'vitest';
import { DEFAULT_LINK, DEFAULT_STREAM } from '../model/defaults';
import { shortestPathRouting } from '../model/routing';
import { EMPTY_HIGHLIGHT, buildRouteHighlight, newStream, recomputeRoutes, routeLinks } from '../model/streams';
import type { GraphLink, GraphNode, Stream } from '../model/types';

const node = (key: string): GraphNode => ({ id: key, data: { id: key, precision: 0.1 } });
const link = (id: string, source: string, target: string): GraphLink => ({ id, source, target, data: DEFAULT_LINK });

const nodes = ['a', 'b', 'c'].map(node);
const chain = [link('ab', 'a', 'b'), link('cb', 'c', 'b')]; // second link stored c → b on purpose

const stream = (overrides: Partial<Stream>): Stream => ({
    ...newStream('s', []),
    ...overrides,
});

describe('newStream', () => {
    it('uses defaults and the next free name', () => {
        const first = newStream('s1', []);
        expect(first).toMatchObject({ id: 's1', name: 'stream1', ...DEFAULT_STREAM, start_node: null, end_node: null });
        expect(first.status).toBe('missing-endpoint');
        expect(newStream('s2', [first]).name).toBe('stream2');
    });
    it('assigns a hue in range, or the given one', () => {
        const hue = newStream('s', []).hue;
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
        expect(Number.isInteger(hue)).toBe(true);
        expect(newStream('s', [], 42).hue).toBe(42);
    });
});

describe('recomputeRoutes', () => {
    it('computes routes and statuses', () => {
        const input = [
            stream({ id: 'ok', start_node: 'a', end_node: 'c' }),
            stream({ id: 'missing', start_node: 'a', end_node: null }),
            stream({ id: 'gone', start_node: 'a', end_node: 'deleted' }),
            stream({ id: 'same', start_node: 'b', end_node: 'b' }),
            stream({ id: 'island', start_node: 'a', end_node: 'c' }),
        ];
        const out = recomputeRoutes(input, nodes, chain, shortestPathRouting);
        expect(out[0]).toMatchObject({ status: 'ok', route: ['a', 'b', 'c'] });
        expect(out[1]).toMatchObject({ status: 'missing-endpoint', route: [] });
        expect(out[2]).toMatchObject({ status: 'missing-endpoint', route: [] });
        expect(out[3]).toMatchObject({ status: 'same-endpoint', route: [] });

        const island = recomputeRoutes([input[4]], nodes, [chain[0]], shortestPathRouting);
        expect(island[0]).toMatchObject({ status: 'unreachable', route: [] });
    });

    it('never deletes streams', () => {
        const out = recomputeRoutes([stream({ start_node: 'x', end_node: 'y' })], [], [], shortestPathRouting);
        expect(out).toHaveLength(1);
    });

    it('keeps references when nothing changed', () => {
        const first = recomputeRoutes([stream({ start_node: 'a', end_node: 'c' })], nodes, chain, shortestPathRouting);
        const second = recomputeRoutes(first, nodes, chain, shortestPathRouting);
        expect(second).toBe(first);
        expect(second[0]).toBe(first[0]);
    });

    it('invalidates and restores when topology changes', () => {
        const ok = recomputeRoutes([stream({ start_node: 'a', end_node: 'c' })], nodes, chain, shortestPathRouting);
        const broken = recomputeRoutes(ok, nodes, [chain[0]], shortestPathRouting);
        expect(broken[0].status).toBe('unreachable');
        const restored = recomputeRoutes(broken, nodes, chain, shortestPathRouting);
        expect(restored[0]).toMatchObject({ status: 'ok', route: ['a', 'b', 'c'] });
    });
});

describe('routeLinks', () => {
    it('reports travel direction relative to link orientation', () => {
        expect(routeLinks(['a', 'b', 'c'], chain)).toEqual([
            { linkId: 'ab', direction: 'forward' },
            { linkId: 'cb', direction: 'reverse' },
        ]);
        expect(routeLinks(['c', 'b', 'a'], chain)).toEqual([
            { linkId: 'cb', direction: 'forward' },
            { linkId: 'ab', direction: 'reverse' },
        ]);
    });
});

describe('buildRouteHighlight', () => {
    const streams = recomputeRoutes(
        [stream({ id: 'ok', start_node: 'a', end_node: 'c' }), stream({ id: 'bad', start_node: 'a', end_node: null })],
        nodes,
        chain,
        shortestPathRouting,
    );

    it('returns the shared empty highlight when nothing applies', () => {
        expect(buildRouteHighlight(null, streams, chain)).toBe(EMPTY_HIGHLIGHT);
        expect(buildRouteHighlight({ kind: 'node', id: 'a' }, streams, chain)).toBe(EMPTY_HIGHLIGHT);
        expect(buildRouteHighlight({ kind: 'stream', id: 'bad' }, streams, chain)).toBe(EMPTY_HIGHLIGHT);
        expect(buildRouteHighlight({ kind: 'stream', id: 'nope' }, streams, chain)).toBe(EMPTY_HIGHLIGHT);
    });

    it('highlights the selected stream route', () => {
        expect(buildRouteHighlight({ kind: 'stream', id: 'ok' }, streams, chain)).toEqual({
            hue: streams[0].hue,
            nodes: { a: true, b: true, c: true },
            links: { ab: 'forward', cb: 'reverse' },
        });
    });
});
