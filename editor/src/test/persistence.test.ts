import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LINK, DEFAULT_PRECISION, DEFAULT_STREAM } from '../model/defaults';
import {
    DEFAULT_VIEWPORT,
    EMPTY_SNAPSHOT,
    STORAGE_KEY,
    deserialize,
    loadSnapshot,
    serialize,
    writeSnapshot,
    type EditorSnapshot,
    type StorageLike,
} from '../model/persistence';
import { brokenStorage, fakeStorage } from './fakeStorage';

const snapshot: EditorSnapshot = {
    nodes: [
        { id: 'k1', position: { x: 10, y: 20 }, data: { id: 'n1', precision: 0.5 } },
        { id: 'k2', position: { x: 30, y: 40 }, data: { id: 'n2', precision: 0.1 } },
    ],
    links: [{ id: 'l1', source: 'k1', target: 'k2', sourceHandle: 'right', targetHandle: null, data: { length: 5, bandwidth: 100 } }],
    streams: [
        { id: 's1', name: 'stream1', message_size: 64, period_ns: 2000, e2e_latency_ns: 1000, max_jitter_ns: 10, start_node: 'k1', end_node: 'k2' },
    ],
    viewport: { x: 1, y: 2, zoom: 1.5 },
};

describe('serialize / deserialize', () => {
    it('round-trips a snapshot', () => {
        expect(deserialize(serialize(snapshot))).toEqual(snapshot);
    });

    it('whitelists fields', () => {
        const noisy = {
            ...snapshot,
            nodes: [{ ...snapshot.nodes[0], selected: true, measured: { width: 1, height: 1 } }],
        } as unknown as EditorSnapshot;
        const parsed = JSON.parse(serialize(noisy));
        expect(parsed.version).toBe(1);
        expect(Object.keys(parsed.nodes[0]).sort()).toEqual(['data', 'id', 'position']);
    });

    it('rejects garbage and other schema versions', () => {
        expect(deserialize('not json')).toBeNull();
        expect(deserialize('42')).toBeNull();
        expect(deserialize(JSON.stringify({ version: 2, nodes: [] }))).toBeNull();
        expect(deserialize(JSON.stringify({ nodes: [] }))).toBeNull();
    });

    it('drops dangling links and clears unknown stream endpoints', () => {
        const raw = JSON.stringify({
            version: 1,
            nodes: snapshot.nodes,
            links: [...snapshot.links, { id: 'bad', source: 'k1', target: 'ghost', data: {} }],
            streams: [{ ...snapshot.streams[0], end_node: 'ghost' }],
            viewport: snapshot.viewport,
        });
        const parsed = deserialize(raw)!;
        expect(parsed.links.map((l) => l.id)).toEqual(['l1']);
        expect(parsed.streams[0]).toMatchObject({ start_node: 'k1', end_node: null });
    });

    it('fills missing or malformed values with defaults', () => {
        const raw = JSON.stringify({
            version: 1,
            nodes: [{ id: 'k1', data: {} }, { id: 'k2', position: { x: 'oops' }, data: { id: 'x', precision: '0.25' } }, 'junk', { data: {} }],
            links: [{ id: 'l1', source: 'k1', target: 'k2' }],
            streams: [{ id: 's1' }, null],
        });
        const parsed = deserialize(raw)!;
        expect(parsed.nodes).toEqual([
            { id: 'k1', position: { x: 0, y: 0 }, data: { id: 'k1', precision: DEFAULT_PRECISION } },
            { id: 'k2', position: { x: 0, y: 0 }, data: { id: 'x', precision: 0.25 } },
        ]);
        expect(parsed.links[0].data).toEqual(DEFAULT_LINK);
        expect(parsed.streams).toEqual([{ id: 's1', name: 's1', ...DEFAULT_STREAM, start_node: null, end_node: null }]);
        expect(parsed.viewport).toEqual(DEFAULT_VIEWPORT);
    });
});

describe('loadSnapshot', () => {
    it('returns the empty snapshot without storage or data', () => {
        expect(loadSnapshot(undefined)).toBe(EMPTY_SNAPSHOT);
        expect(loadSnapshot(fakeStorage())).toBe(EMPTY_SNAPSHOT);
    });

    it('reads a stored snapshot', () => {
        const storage = fakeStorage({ [STORAGE_KEY]: serialize(snapshot) });
        expect(loadSnapshot(storage)).toEqual(snapshot);
    });

    it('survives corrupt data and throwing storage', () => {
        expect(loadSnapshot(fakeStorage({ [STORAGE_KEY]: '{' }))).toBe(EMPTY_SNAPSHOT);
        const throwing: StorageLike = {
            getItem: () => {
                throw new Error('denied');
            },
            setItem: () => {},
        };
        expect(loadSnapshot(throwing)).toBe(EMPTY_SNAPSHOT);
    });
});

describe('writeSnapshot', () => {
    it('writes under the storage key and reports failures', () => {
        const storage = fakeStorage();
        expect(writeSnapshot(storage, '{"version":1}')).toBe(true);
        expect(storage.data.get(STORAGE_KEY)).toBe('{"version":1}');

        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(writeSnapshot(brokenStorage, '{}')).toBe(false);
        error.mockRestore();
    });
});
