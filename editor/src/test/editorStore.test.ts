import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LINK, DEFAULT_PRECISION } from '../model/defaults';
import { EMPTY_SNAPSHOT, deserialize, serialize } from '../model/persistence';
import { EMPTY_SCHEDULE, type Schedule } from '../model/schedule';
import { EMPTY_HIGHLIGHT } from '../model/streams';
import * as wasmScheduler from '../simulation/wasm';
import { dataFromSnapshot, snapshotOf, useEditorStore } from '../store/editorStore';

const store = () => useEditorStore.getState();

function connectKeys(a: string, b: string) {
    return store().connect({ source: a, target: b, sourceHandle: 'right', targetHandle: 'left' });
}

/** Three nodes in a chain a - b - c; returns their keys. */
function chain() {
    const a = store().addNode({ x: 0, y: 0 });
    const b = store().addNode({ x: 100, y: 0 });
    const c = store().addNode({ x: 200, y: 0 });
    expect(connectKeys(a, b)).toBe(true);
    expect(connectKeys(b, c)).toBe(true);
    return { a, b, c };
}

function mockScheduleFromStreams(
    streams: { id: string; route: string[]; period_ns: number; message_size: number }[],
    edges: { id: string; source: string; target: string; data: { length: number; bandwidth: number } }[],
): Schedule {
    return {
        streams: streams
            .filter((stream) => stream.route.length >= 2)
            .map((stream) => {
                let t = 0;
                const hops = stream.route.slice(0, -1).map((from, index) => {
                    const to = stream.route[index + 1];
                    const link = edges.find((edge) => (edge.source === from && edge.target === to) || (edge.source === to && edge.target === from));
                    const bandwidth = link?.data.bandwidth ?? DEFAULT_LINK.bandwidth;
                    const txStart = t;
                    const txEnd = txStart + (stream.message_size * 8 * 1000) / bandwidth;
                    const rxEnd = txEnd + (link?.data.length ?? 0) * 5;
                    t = rxEnd;
                    return {
                        link_id: link?.id ?? `${from}-${to}`,
                        from,
                        to,
                        tx_start_ns: txStart,
                        tx_end_ns: txEnd,
                        rx_end_ns: rxEnd,
                    };
                });
                return {
                    stream_id: stream.id,
                    period_ns: stream.period_ns,
                    hops,
                };
            }),
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(wasmScheduler, 'runSchedulerWasm').mockImplementation(async (streams, links) => mockScheduleFromStreams(
        streams.map((stream) => ({
            id: stream.id,
            route: stream.route,
            period_ns: stream.period_ns,
            message_size: stream.message_size,
        })),
        links.map((link) => ({
            id: link.id,
            source: link.source,
            target: link.target,
            data: { length: link.data.length, bandwidth: link.data.bandwidth },
        })),
    ));
    useEditorStore.setState(dataFromSnapshot(EMPTY_SNAPSHOT));
});

describe('nodes', () => {
    it('adds nodes with sequential ids that fill gaps', () => {
        const k1 = store().addNode({ x: 0, y: 0 });
        const k2 = store().addNode({ x: 1, y: 1 });
        expect(store().nodes.map((n) => n.data.id)).toEqual(['n1', 'n2']);
        expect(store().nodes[0]).toMatchObject({ id: k1, type: 'network', data: { precision: DEFAULT_PRECISION } });

        store().removeNode(k1);
        store().addNode({ x: 2, y: 2 });
        expect(store().nodes.map((n) => n.data.id)).toEqual(['n2', 'n1']);
        expect(store().nodes[0].id).toBe(k2);
    });

    it('renames with validation and no cascade', () => {
        const { a, b } = chain();
        expect(store().renameNode(a, '  ')).toEqual({ ok: false, reason: 'empty' });
        expect(store().renameNode(b, 'n1')).toEqual({ ok: false, reason: 'duplicate' });
        expect(store().renameNode(a, 'n1')).toEqual({ ok: true });
        expect(store().renameNode(a, ' core ')).toEqual({ ok: true });
        expect(store().nodes.find((n) => n.id === a)?.data.id).toBe('core');
        expect(store().edges[0]).toMatchObject({ source: a, target: b });
    });

    it('updates precision', () => {
        const k = store().addNode({ x: 0, y: 0 });
        store().updateNodeData(k, { precision: 2 });
        expect(store().nodes[0].data).toEqual({ id: 'n1', precision: 2 });
    });
});

describe('links', () => {
    it('connects once per pair and rejects self links', () => {
        const { a, b, c } = chain();
        expect(store().edges).toHaveLength(2);
        expect(store().edges[0]).toMatchObject({ type: 'link', sourceHandle: 'right', targetHandle: 'left', data: DEFAULT_LINK });
        expect(connectKeys(b, a)).toBe(false);
        expect(connectKeys(a, a)).toBe(false);
        expect(connectKeys(a, 'ghost')).toBe(false);
        expect(connectKeys(a, c)).toBe(true);
        expect(store().edges).toHaveLength(3);
    });

    it('updates and removes links', () => {
        const { a, b } = chain();
        const id = store().edges[0].id;
        store().updateLink(id, { length: 42 });
        expect(store().edges[0].data).toEqual({ length: 42, bandwidth: DEFAULT_LINK.bandwidth });
        store().select({ kind: 'link', id });
        store().removeLink(id);
        expect(store().edges).toHaveLength(1);
        expect(store().selection).toBeNull();
        expect(connectKeys(a, b)).toBe(true);
    });
});

describe('streams and routes', () => {
    it('adds a stream, selects it and routes it', () => {
        const { a, b, c } = chain();
        const id = store().addStream();
        expect(store().selection).toEqual({ kind: 'stream', id });
        expect(store().streams[0]).toMatchObject({ name: 'stream1', status: 'missing-endpoint' });
        expect(store().streams[0].hue).toBeGreaterThanOrEqual(0);
        expect(store().streams[0].hue).toBeLessThan(360);
        expect(store().routeHighlight).toBe(EMPTY_HIGHLIGHT);

        store().updateStream(id, { start_node: a, end_node: c });
        expect(store().streams[0]).toMatchObject({ status: 'ok', route: [a, b, c] });
        expect(store().routeHighlight.nodes).toEqual({ [a]: true, [b]: true, [c]: true });
        expect(Object.values(store().routeHighlight.links)).toEqual(['forward', 'forward']);
    });

    it('recomputes when topology changes and keeps invalid streams', () => {
        const { a, b, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });

        expect(connectKeys(a, c)).toBe(true);
        expect(store().streams[0].route).toEqual([a, c]);

        store().onNodesChange([{ type: 'remove', id: b }]);
        expect(store().nodes).toHaveLength(2);
        expect(store().edges).toHaveLength(1);
        expect(store().streams[0].route).toEqual([a, c]);

        store().removeLink(store().edges[0].id);
        expect(store().streams).toHaveLength(1);
        expect(store().streams[0]).toMatchObject({ status: 'unreachable', route: [] });
        expect(store().routeHighlight).toBe(EMPTY_HIGHLIGHT);
    });

    it('clears selection when the subject disappears', () => {
        const { a } = chain();
        store().select({ kind: 'node', id: a });
        store().removeNode(a);
        expect(store().selection).toBeNull();

        const id = store().addStream();
        store().removeStream(id);
        expect(store().selection).toBeNull();
        expect(store().streams).toHaveLength(0);
    });

    it('selecting a node clears the route highlight', () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        expect(store().routeHighlight).not.toBe(EMPTY_HIGHLIGHT);
        store().select({ kind: 'node', id: a });
        expect(store().routeHighlight).toBe(EMPTY_HIGHLIGHT);
        store().select(null);
        expect(store().selection).toBeNull();
    });
});

describe('removals that cannot affect routes', () => {
    it('keep the streams untouched when an unrelated node or link goes', () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        const routed = store().streams;

        const lonely = store().addNode({ x: 9, y: 9 });
        const other = store().addNode({ x: 10, y: 10 });
        expect(connectKeys(lonely, other)).toBe(true);
        const sideLink = store().edges[store().edges.length - 1].id;

        store().removeLink(sideLink);
        expect(store().streams).toBe(routed);
        store().removeNode(lonely);
        expect(store().streams).toBe(routed);
        expect(store().nodes.some((n) => n.id === lonely)).toBe(false);
    });

    it('still re-derive when the removal touches a route', () => {
        const { a, b, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        store().removeNode(b);
        expect(store().streams[0].status).toBe('unreachable');
    });
});

describe('schedule', () => {
    it('uses the wasm scheduler for derived route schedules', async () => {
        const spy = vi.spyOn(wasmScheduler, 'runSchedulerWasm').mockResolvedValue({ streams: [{ stream_id: 's', period_ns: 1_000, hops: [] }] });

        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });

        await vi.waitFor(() => {
            expect(spy).toHaveBeenCalled();
        });
        expect(store().schedule).toEqual({ streams: [{ stream_id: 's', period_ns: 1_000, hops: [] }] });
    });

    it('keeps its identity when nothing feeding it changed', () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        const before = store().schedule;
        const linkId = store().edges[0].id;

        store().updateLink(linkId, { length: store().edges[0].data.length }); // no-op patch
        expect(store().edges).toBe(store().edges);
        expect(store().schedule).toBe(before);

        store().updateStream(id, { name: 'renamed' }); // not a schedule field
        expect(store().schedule).toBe(before);

        store().select({ kind: 'node', id: a });
        expect(store().schedule).toBe(before);
    });

    it('is empty until a stream is routable', async () => {
        const { a, c } = chain();
        expect(store().schedule).toBe(EMPTY_SCHEDULE);
        const id = store().addStream();
        expect(store().schedule).toBe(EMPTY_SCHEDULE);
        store().updateStream(id, { start_node: a, end_node: c });

        await vi.waitFor(() => {
            expect(store().schedule.streams).toHaveLength(1);
        });
        expect(store().schedule.streams[0]).toMatchObject({ stream_id: id, period_ns: store().streams[0].period_ns });
        expect(store().schedule.streams[0].hops).toHaveLength(2);
    });

    it('reacts to link attribute and topology changes', async () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });

        await vi.waitFor(() => {
            expect(store().schedule.streams).toHaveLength(1);
        });
        const before = store().schedule.streams[0].hops[0];

        store().updateLink(before.link_id, { bandwidth: 100 });
        await vi.waitFor(() => {
            const slower = store().schedule.streams[0].hops[0];
            expect(slower.tx_end_ns - slower.tx_start_ns).toBe(10 * (before.tx_end_ns - before.tx_start_ns));
        });

        store().removeLink(before.link_id);
        await vi.waitFor(() => {
            expect(store().schedule).toBe(EMPTY_SCHEDULE);
        });

        store().clearCanvas();
        expect(store().schedule).toBe(EMPTY_SCHEDULE);
    });

    it('is restored from a snapshot', async () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });

        await vi.waitFor(() => {
            expect(store().schedule.streams).toHaveLength(1);
        });

        const restored = dataFromSnapshot(deserialize(serialize(snapshotOf(store())))!);
        useEditorStore.setState(restored);

        await vi.waitFor(() => {
            expect(useEditorStore.getState().schedule.streams).toHaveLength(1);
        });
        expect(useEditorStore.getState().schedule.streams[0].hops.map((h) => h.link_id)).toEqual(store().schedule.streams[0].hops.map((h) => h.link_id));
    });
});

describe('position changes', () => {
    it('do not recompute routes', () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        const before = store().streams;
        store().onNodesChange([{ type: 'position', id: a, position: { x: 5, y: 5 } }]);
        expect(store().streams).toBe(before);
        expect(store().nodes.find((n) => n.id === a)?.position).toEqual({ x: 5, y: 5 });
    });
});

describe('snapshot', () => {
    it('round-trips through persistence and restores routes', () => {
        const { a, c } = chain();
        const id = store().addStream();
        store().updateStream(id, { start_node: a, end_node: c });
        store().setViewport({ x: 3, y: 4, zoom: 2 });

        const restored = dataFromSnapshot(deserialize(serialize(snapshotOf(store())))!);
        expect(restored.nodes.map((n) => n.data.id)).toEqual(['n1', 'n2', 'n3']);
        expect(restored.edges).toHaveLength(2);
        expect(restored.streams[0]).toMatchObject({ id, status: 'ok', route: store().streams[0].route });
        expect(restored.viewport).toEqual({ x: 3, y: 4, zoom: 2 });
        expect(restored.selection).toBeNull();
    });

    it('clearCanvas empties everything but keeps the viewport', () => {
        chain();
        store().addStream();
        store().setViewport({ x: 9, y: 9, zoom: 1 });
        store().clearCanvas();
        expect(store().nodes).toEqual([]);
        expect(store().edges).toEqual([]);
        expect(store().streams).toEqual([]);
        expect(store().selection).toBeNull();
        expect(store().viewport).toEqual({ x: 9, y: 9, zoom: 1 });
    });
});
