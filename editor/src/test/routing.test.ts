import { describe, expect, it } from 'vitest';
import { buildAdjacency } from '../model/graph';
import { defaultRouting, shortestPathRouting, type RoutingStrategy } from '../model/routing';
import { DEFAULT_LINK } from '../model/defaults';
import type { GraphLink, GraphNode } from '../model/types';

const node = (key: string): GraphNode => ({ id: key, data: { id: key, precision: 0.1 } });
const link = (source: string, target: string): GraphLink => ({ id: `${source}-${target}`, source, target, data: DEFAULT_LINK });

describe('shortestPathRouting', () => {
    it('is the default strategy', () => {
        expect(defaultRouting).toBe(shortestPathRouting);
        expect(shortestPathRouting.name).toBe('shortest-path');
    });

    it('returns the fewest-hop path', () => {
        // a - b - c - d plus shortcut a - d
        const nodes = ['a', 'b', 'c', 'd'].map(node);
        const adj = buildAdjacency(nodes, [link('a', 'b'), link('b', 'c'), link('c', 'd'), link('a', 'd')]);
        expect(shortestPathRouting.route(adj, 'a', 'd')).toEqual(['a', 'd']);
        expect(shortestPathRouting.route(adj, 'a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('traverses links in either direction', () => {
        const adj = buildAdjacency(['a', 'b', 'c'].map(node), [link('b', 'a'), link('c', 'b')]);
        expect(shortestPathRouting.route(adj, 'a', 'c')).toEqual(['a', 'b', 'c']);
        expect(shortestPathRouting.route(adj, 'c', 'a')).toEqual(['c', 'b', 'a']);
    });

    it('breaks ties by node creation order', () => {
        // a - x - d and a - y - d; x created before y
        const nodes = ['a', 'x', 'y', 'd'].map(node);
        const adj = buildAdjacency(nodes, [link('a', 'y'), link('y', 'd'), link('a', 'x'), link('x', 'd')]);
        expect(shortestPathRouting.route(adj, 'a', 'd')).toEqual(['a', 'x', 'd']);
    });

    it('returns null when disconnected or unknown', () => {
        const adj = buildAdjacency(['a', 'b', 'c'].map(node), [link('a', 'b')]);
        expect(shortestPathRouting.route(adj, 'a', 'c')).toBeNull();
        expect(shortestPathRouting.route(adj, 'a', 'nope')).toBeNull();
    });

    it('returns a single-node path for from === to', () => {
        const adj = buildAdjacency(['a'].map(node), []);
        expect(shortestPathRouting.route(adj, 'a', 'a')).toEqual(['a']);
    });
});

describe('RoutingStrategy', () => {
    it('can be replaced by a custom implementation', () => {
        const reversed: RoutingStrategy = {
            name: 'stub',
            route: (adj, from, to) => shortestPathRouting.route(adj, to, from)?.reverse() ?? null,
        };
        const adj = buildAdjacency(['a', 'b'].map(node), [link('a', 'b')]);
        expect(reversed.route(adj, 'a', 'b')).toEqual(['a', 'b']);
    });
});
