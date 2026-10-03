import { describe, expect, it } from 'vitest';
import { DEFAULT_LINK } from '../model/defaults';
import {
    EMPTY_SCHEDULE,
    defaultScheduler,
    mockScheduler,
    propagationNs,
    streamOffsetNs,
    transmissionNs,
} from '../model/schedule';
import { newStream } from '../model/streams';
import type { GraphLink, Stream } from '../model/types';

const link = (id: string, source: string, target: string, length = 10, bandwidth = 1000): GraphLink => ({
    id,
    source,
    target,
    data: { length, bandwidth },
});
const chain = [link('ab', 'a', 'b'), link('cb', 'c', 'b')]; // second link stored c → b on purpose

const routed = (id: string, route: string[], overrides: Partial<Stream> = {}): Stream => ({
    ...newStream(id, []),
    start_node: route[0],
    end_node: route[route.length - 1],
    route,
    status: 'ok',
    ...overrides,
});

describe('timing helpers', () => {
    it('computes transmission time from size and bandwidth', () => {
        expect(transmissionNs(128, 1000)).toBe(1024); // 1024 bit at 1 Gbit/s
        expect(transmissionNs(1500, 100)).toBe(120_000);
        expect(transmissionNs(0, 1000)).toBe(0);
        expect(transmissionNs(-5, 1000)).toBe(0);
    });
    it('falls back to the default bandwidth when invalid', () => {
        expect(transmissionNs(128, 0)).toBe(transmissionNs(128, DEFAULT_LINK.bandwidth));
        expect(transmissionNs(128, Number.NaN)).toBe(transmissionNs(128, DEFAULT_LINK.bandwidth));
    });
    it('computes propagation from length', () => {
        expect(propagationNs(10)).toBe(50);
        expect(propagationNs(-1)).toBe(0);
        expect(propagationNs(Number.NaN)).toBe(0);
    });
    it('spreads offsets across the period', () => {
        expect([0, 1, 2].map((i) => streamOffsetNs(i, 3, 300))).toEqual([0, 100, 200]);
        expect(streamOffsetNs(0, 0, 300)).toBe(0);
    });
});

describe('mockScheduler', () => {
    it('is the default scheduler', () => {
        expect(defaultScheduler).toBe(mockScheduler);
    });

    it('chains hops store-and-forward with correct link orientation', () => {
        const s = routed('s', ['a', 'b', 'c'], { message_size: 128, period_ns: 1_000_000 });
        const schedule = mockScheduler.schedule([s], chain);
        expect(schedule.streams).toHaveLength(1);
        const { hops, period_ns, stream_id } = schedule.streams[0];
        expect(stream_id).toBe('s');
        expect(period_ns).toBe(1_000_000);
        expect(hops).toEqual([
            { link_id: 'ab', from: 'a', to: 'b', tx_start_ns: 0, tx_end_ns: 1024, rx_end_ns: 1074 },
            { link_id: 'cb', from: 'b', to: 'c', tx_start_ns: 1074, tx_end_ns: 2098, rx_end_ns: 2148 },
        ]);
    });

    it('offsets streams by their index over all streams', () => {
        const streams = [
            routed('s0', ['a', 'b'], { period_ns: 3000 }),
            { ...routed('bad', ['a', 'b'], { period_ns: 3000 }), status: 'unreachable' as const, route: [] },
            routed('s2', ['a', 'b'], { period_ns: 3000 }),
        ];
        const schedule = mockScheduler.schedule(streams, chain);
        expect(schedule.streams.map((s) => [s.stream_id, s.hops[0].tx_start_ns])).toEqual([
            ['s0', 0],
            ['s2', 2000],
        ]);
    });

    it('uses per-link length and bandwidth', () => {
        const slow = [link('ab', 'a', 'b', 1000, 10)];
        const s = routed('s', ['a', 'b'], { message_size: 100 });
        const [hop] = mockScheduler.schedule([s], slow).streams[0].hops;
        expect(hop.tx_end_ns - hop.tx_start_ns).toBe(80_000);
        expect(hop.rx_end_ns - hop.tx_end_ns).toBe(5000);
    });

    it('allows zero-size messages', () => {
        const s = routed('s', ['a', 'b'], { message_size: 0 });
        const [hop] = mockScheduler.schedule([s], chain).streams[0].hops;
        expect(hop.tx_end_ns).toBe(hop.tx_start_ns);
        expect(hop.rx_end_ns).toBe(hop.tx_start_ns + 50);
    });

    it('skips unrouted, zero-period and stale streams', () => {
        const streams = [
            { ...routed('unrouted', ['a', 'b']), status: 'missing-endpoint' as const, route: [] },
            routed('zero', ['a', 'b'], { period_ns: 0 }),
            routed('stale', ['a', 'z']), // no link a-z
        ];
        expect(mockScheduler.schedule(streams, chain)).toBe(EMPTY_SCHEDULE);
        expect(mockScheduler.schedule([], chain)).toBe(EMPTY_SCHEDULE);
    });

});
