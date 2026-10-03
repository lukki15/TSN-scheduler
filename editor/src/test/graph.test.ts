import { describe, expect, it } from 'vitest';
import {
    buildAdjacency,
    canConnect,
    findLink,
    indexLinks,
    isNodeIdAvailable,
    nextFreeName,
    nextFreeNodeId,
    pairKey,
    pruneDanglingLinks,
} from '../model/graph';
import type { GraphLink, GraphNode } from '../model/types';

const node = (key: string, id = key): GraphNode => ({ id: key, data: { id, precision: 0.1 } });
const link = (id: string, source: string, target: string): GraphLink => ({
    id,
    source,
    target,
    data: { length: 10, bandwidth: 1000 },
});

const nodes = [node('a'), node('b'), node('c')];
const links = [link('ab', 'a', 'b')];

describe('pairKey', () => {
    it('is symmetric', () => {
        expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
        expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
    });
});

describe('findLink', () => {
    it('finds a link in either orientation', () => {
        expect(findLink(links, 'a', 'b')?.id).toBe('ab');
        expect(findLink(links, 'b', 'a')?.id).toBe('ab');
        expect(findLink(links, 'a', 'c')).toBeUndefined();
    });
});

describe('canConnect', () => {
    it('allows a new pair', () => {
        expect(canConnect(nodes, links, 'b', 'c')).toEqual({ ok: true });
    });
    it('rejects self links', () => {
        expect(canConnect(nodes, links, 'a', 'a')).toEqual({ ok: false, reason: 'self' });
    });
    it('rejects duplicates in both orientations', () => {
        expect(canConnect(nodes, links, 'a', 'b')).toEqual({ ok: false, reason: 'duplicate' });
        expect(canConnect(nodes, links, 'b', 'a')).toEqual({ ok: false, reason: 'duplicate' });
    });
    it('rejects unknown nodes', () => {
        expect(canConnect(nodes, links, 'a', 'zzz')).toEqual({ ok: false, reason: 'unknown-node' });
    });
});

describe('node ids', () => {
    it('checks availability excluding the node itself', () => {
        expect(isNodeIdAvailable(nodes, 'a')).toBe(false);
        expect(isNodeIdAvailable(nodes, 'a', 'a')).toBe(true);
        expect(isNodeIdAvailable(nodes, 'a', 'b')).toBe(false);
        expect(isNodeIdAvailable(nodes, 'new')).toBe(true);
    });
    it('fills gaps when generating the next free id', () => {
        expect(nextFreeName([], 'n')).toBe('n1');
        expect(nextFreeName(['n1', 'n2'], 'n')).toBe('n3');
        expect(nextFreeName(['n1', 'n3'], 'n')).toBe('n2');
        expect(nextFreeNodeId([node('k1', 'n1'), node('k2', 'n2')])).toBe('n3');
    });
});

describe('buildAdjacency', () => {
    it('lists neighbors in node order regardless of link order', () => {
        const ns = [node('a'), node('b'), node('c'), node('d')];
        const ls = [link('ad', 'a', 'd'), link('ac', 'c', 'a'), link('ab', 'a', 'b')];
        const adj = buildAdjacency(ns, ls);
        expect(adj.get('a')!.map((e) => e.neighbor)).toEqual(['b', 'c', 'd']);
        expect(adj.get('c')).toEqual([{ neighbor: 'a', linkId: 'ac' }]);
        expect(adj.get('d')).toEqual([{ neighbor: 'a', linkId: 'ad' }]);
    });
    it('creates entries for isolated nodes and skips links to unknown nodes', () => {
        const adj = buildAdjacency(nodes, [...links, link('ax', 'a', 'x')]);
        expect(adj.get('c')).toEqual([]);
        expect(adj.get('a')).toEqual([{ neighbor: 'b', linkId: 'ab' }]);
        expect(adj.has('x')).toBe(false);
    });
});

describe('link maintenance', () => {
    it('indexes links by unordered node pair', () => {
        const between = indexLinks([link('ab', 'a', 'b'), link('bc', 'b', 'c')]);
        expect(between('b', 'a')?.id).toBe('ab');
        expect(between('b', 'c')?.id).toBe('bc');
        expect(between('a', 'c')).toBeUndefined();
    });
    it('prunes dangling links and keeps the array identity otherwise', () => {
        const ls = [link('ab', 'a', 'b'), link('bx', 'b', 'x')];
        expect(pruneDanglingLinks(nodes, ls).map((l) => l.id)).toEqual(['ab']);
        expect(pruneDanglingLinks(nodes, links)).toBe(links);
    });
});
