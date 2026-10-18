import { describe, expect, it } from 'vitest';
import { LANE_MAX_OFFSET, buildLanes } from '../model/packets';

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
