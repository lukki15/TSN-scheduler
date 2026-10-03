import { describe, expect, it } from 'vitest';
import { DEFAULT_LINK } from '../model/defaults';
import { linkSources } from '../model/graph';
import { LANE_MAX_OFFSET, MAX_INSTANCES_IN_FLIGHT, buildLanes, packetsAt } from '../model/packets';
import type { Schedule } from '../model/schedule';

const links = linkSources([
    { id: 'ab', source: 'a', target: 'b', data: DEFAULT_LINK },
    { id: 'cb', source: 'c', target: 'b', data: DEFAULT_LINK },
]);

// a → b: tx 0..100, arrives 150 ; b → c: tx 150..250, arrives 300 ; period 1000
const schedule: Schedule = {
    streams: [
        {
            stream_id: 's',
            period_ns: 1000,
            hops: [
                { link_id: 'ab', from: 'a', to: 'b', tx_start_ns: 0, tx_end_ns: 100, rx_end_ns: 150 },
                { link_id: 'cb', from: 'b', to: 'c', tx_start_ns: 150, tx_end_ns: 250, rx_end_ns: 300 },
            ],
        },
    ],
};

const only = (t: number) => {
    const p = packetsAt(schedule, t, links);
    expect(p).toHaveLength(1);
    return p[0];
};

describe('packetsAt', () => {
    it('returns nothing before the first transmission or for negative time', () => {
        expect(packetsAt(schedule, -1, links)).toEqual([]);
        const late: Schedule = { streams: [{ ...schedule.streams[0], hops: schedule.streams[0].hops.map((h) => ({ ...h, tx_start_ns: h.tx_start_ns + 500, tx_end_ns: h.tx_end_ns + 500, rx_end_ns: h.rx_end_ns + 500 })) }] };
        expect(packetsAt(late, 100, links)).toEqual([]);
    });

    it('reports phase and progress on the first hop', () => {
        expect(only(50)).toMatchObject({ stream_id: 's', link_id: 'ab', instance: 0, direction: 'forward', phase: 'tx' });
        expect(only(50).progress).toBeCloseTo(50 / 150);
        expect(only(125)).toMatchObject({ phase: 'propagating' });
        expect(only(125).progress).toBeCloseTo(125 / 150);
    });

    it('switches hops exactly at the boundary and reports reverse direction', () => {
        expect(only(150)).toMatchObject({ link_id: 'cb', direction: 'reverse', progress: 0, phase: 'tx' });
        expect(only(299)).toMatchObject({ link_id: 'cb' });
        expect(packetsAt(schedule, 300, links)).toEqual([]);
    });

    it('exposes overall route progress', () => {
        expect(only(0).routeProgress).toBe(0);
        expect(only(150).routeProgress).toBeCloseTo(0.5);
    });

    it('repeats every period', () => {
        const a = only(125);
        const b = only(1125);
        expect(b).toMatchObject({ ...a, instance: 1 });
    });

    it('tracks overlapping transmissions when latency exceeds the period', () => {
        const dense: Schedule = { streams: [{ ...schedule.streams[0], period_ns: 100 }] };
        const packets = packetsAt(dense, 250, links);
        // instances 0,1,2 are in flight (k*100 <= 250 < k*100 + 300 → k = 0..2)
        expect(packets.map((p) => p.instance)).toEqual([0, 1, 2]);
        expect(packets.map((p) => p.link_id)).toEqual(['cb', 'cb', 'ab']);
    });

    it('caps the number of simultaneous instances', () => {
        const tiny: Schedule = { streams: [{ ...schedule.streams[0], period_ns: 1 }] };
        expect(packetsAt(tiny, 299, links)).toHaveLength(MAX_INSTANCES_IN_FLIGHT);
    });

    it('skips zero-duration hops and empty streams', () => {
        const degenerate: Schedule = {
            streams: [
                { stream_id: 'z', period_ns: 10, hops: [{ link_id: 'ab', from: 'a', to: 'b', tx_start_ns: 0, tx_end_ns: 0, rx_end_ns: 0 }] },
                { stream_id: 'e', period_ns: 10, hops: [] },
            ],
        };
        expect(packetsAt(degenerate, 5, links)).toEqual([]);
    });
});

describe('buildLanes', () => {
    const stream = (id: string, linkIds: string[]) => ({
        stream_id: id,
        period_ns: 1000,
        hops: linkIds.map((link_id) => ({ link_id, from: 'x', to: 'y', tx_start_ns: 0, tx_end_ns: 1, rx_end_ns: 2 })),
    });

    it('centers a single stream and spreads two symmetrically', () => {
        const lanes = buildLanes({ streams: [stream('s1', ['ab']), stream('s2', ['ab', 'cb'])] });
        expect(lanes.get('ab')!.get('s1')).toBe(-5);
        expect(lanes.get('ab')!.get('s2')).toBe(5);
        expect(lanes.get('cb')!.get('s2')).toBe(0);
    });

    it('bounds many streams within the max offset and keeps order stable', () => {
        const many = Array.from({ length: 9 }, (_, i) => stream(`s${i}`, ['ab']));
        const lanes = buildLanes({ streams: many }).get('ab')!;
        const offsets = many.map((s) => lanes.get(s.stream_id)!);
        expect(Math.min(...offsets)).toBe(-LANE_MAX_OFFSET);
        expect(Math.max(...offsets)).toBe(LANE_MAX_OFFSET);
        expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    });

    it('counts a stream once per link even with repeated hops', () => {
        const lanes = buildLanes({ streams: [stream('loop', ['ab', 'ab'])] });
        expect(lanes.get('ab')!.get('loop')).toBe(0);
    });
});
