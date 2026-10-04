import { describe, expect, it } from 'vitest';
import type { Schedule, StreamSchedule } from '../model/schedule';
import {
    HYPERPERIOD_CAP_FACTOR,
    MAX_INSTANCES_PER_HOP,
    MAX_LANES,
    assignLanes,
    buildTimelineRows,
    formatUs,
    gcd,
    hyperperiod,
    lcm,
    niceStep,
    niceTicks,
    type TimelineBar,
} from '../model/timeline';
import { DEFAULT_LINK } from '../model/defaults';
import { nodeDisplayIds } from '../model/graph';
import type { GraphLink, GraphNode } from '../model/types';

const node = (key: string): GraphNode => ({ id: key, data: { id: key, precision: 0.1 } });
const nodes = nodeDisplayIds(['a', 'b', 'c'].map(node));
const links: GraphLink[] = [
    { id: 'ab', source: 'a', target: 'b', data: DEFAULT_LINK },
    { id: 'cb', source: 'c', target: 'b', data: DEFAULT_LINK }, // stored c → b on purpose
    { id: 'ax', source: 'a', target: 'x', data: DEFAULT_LINK }, // unknown node
];

const stream = (id: string, period_ns: number, hops: StreamSchedule['hops']): StreamSchedule => ({ stream_id: id, period_ns, hops });
const hop = (link_id: string, from: string, to: string, tx_start_ns: number, tx_end_ns: number, rx_end_ns: number) => ({
    link_id, from, to, tx_start_ns, tx_end_ns, rx_end_ns,
});

describe('hyperperiod', () => {
    it('computes gcd and lcm', () => {
        expect(gcd(12, 18)).toBe(6);
        expect(lcm(4, 6)).toBe(12);
        expect(lcm(0, 6)).toBe(0);
    });

    it('is the period for a single stream and the lcm for several', () => {
        expect(hyperperiod({ streams: [stream('s', 1000, [])] })).toEqual({ windowNs: 1000, capped: false, longestPeriodNs: 1000 });
        expect(hyperperiod({ streams: [stream('a', 2_000_000, []), stream('b', 3_000_000, [])] })).toEqual({
            windowNs: 6_000_000, capped: false, longestPeriodNs: 3_000_000,
        });
    });

    it('rounds periods and ignores non-positive ones', () => {
        expect(hyperperiod({ streams: [stream('a', 1000.4, []), stream('z', 0, []), stream('n', -5, [])] }).windowNs).toBe(1000);
        expect(hyperperiod({ streams: [stream('z', 0, [])] })).toEqual({ windowNs: 0, capped: false, longestPeriodNs: 0 });
        expect(hyperperiod({ streams: [] }).windowNs).toBe(0);
    });

    it('caps to the longest period when the lcm explodes', () => {
        const coprime = { streams: [stream('a', 1_000_000, []), stream('b', 1_000_001, [])] };
        expect(hyperperiod(coprime)).toEqual({ windowNs: 1_000_001, capped: true, longestPeriodNs: 1_000_001 });
        const justUnder = { streams: [stream('a', 1000, []), stream('b', HYPERPERIOD_CAP_FACTOR * 1000, [])] };
        expect(hyperperiod(justUnder).capped).toBe(false);
    });
});

describe('buildTimelineRows', () => {
    const basic: Schedule = {
        streams: [stream('s', 1000, [hop('ab', 'a', 'b', 0, 100, 150), hop('cb', 'b', 'c', 150, 250, 300)])],
    };

    it('creates a group per link in link order with node-id labels', () => {
        const groups = buildTimelineRows(basic, links, nodes, 1000);
        expect(groups.map((g) => g.label)).toEqual(['a ↔ b', 'c ↔ b', 'a ↔ ?']);
        expect(groups.map((g) => g.idle)).toEqual([false, false, true]);
        expect(groups[0].rows.map((r) => r.direction)).toEqual(['forward', 'reverse']);
    });

    it('puts hops into the sub-row matching their direction', () => {
        const [ab, cb] = buildTimelineRows(basic, links, nodes, 1000);
        expect(ab.rows[0].bars).toHaveLength(1); // a → b is forward on link a→b
        expect(ab.rows[1].bars).toHaveLength(0);
        expect(cb.rows[0].bars).toHaveLength(0);
        expect(cb.rows[1].bars).toHaveLength(1); // b → c is reverse on link c→b
        expect(cb.rows[1].bars[0]).toMatchObject({ hop: { from: 'b', to: 'c' }, startNs: 150, txEndNs: 250, rxEndNs: 300, instance: 0, hopIndex: 1 });
    });

    it('repeats instances across the window and wraps tails from the previous window', () => {
        const [ab] = buildTimelineRows(basic, links, nodes, 3000);
        expect(ab.rows[0].bars.map((b) => b.instance)).toEqual([0, 1, 2]);
        expect(ab.rows[0].bars.map((b) => b.startNs)).toEqual([0, 1000, 2000]);
        expect(ab.rows[0].bars.map((b) => b.key)).toEqual(['s:0:0', 's:0:1', 's:0:2']);

        const slow: Schedule = { streams: [stream('l', 1000, [hop('ab', 'a', 'b', 500, 600, 1700)])] };
        const [slowAb] = buildTimelineRows(slow, links, nodes, 1000);
        expect(slowAb.rows[0].bars.map((b) => [b.instance, b.startNs, b.rxEndNs])).toEqual([
            [-1, -500, 700], // previous window's frame still arriving at t = 0
            [0, 500, 1700],
        ]);
    });

    it('stacks overlapping bars into lanes', () => {
        const overlapping: Schedule = {
            streams: [
                stream('p', 1000, [hop('ab', 'a', 'b', 0, 400, 450)]),
                stream('q', 1000, [hop('ab', 'a', 'b', 200, 600, 650)]),
                stream('r', 1000, [hop('ab', 'a', 'b', 700, 800, 850)]),
            ],
        };
        const [ab] = buildTimelineRows(overlapping, links, nodes, 1000);
        expect(ab.rows[0].laneCount).toBe(2);
        expect(ab.rows[0].bars.map((b) => [b.streamId, b.lane])).toEqual([['p', 0], ['q', 1], ['r', 0]]);
    });

    it('caps the number of instances per hop', () => {
        const tiny: Schedule = { streams: [stream('t', 1, [hop('ab', 'a', 'b', 0, 1, 1)])] };
        const [ab] = buildTimelineRows(tiny, links, nodes, 1_000_000);
        expect(ab.rows[0].bars).toHaveLength(MAX_INSTANCES_PER_HOP);
        expect(ab.rows[0].truncated).toBe(true);
    });

    it('marks everything idle when the window is zero or no stream is scheduled', () => {
        expect(buildTimelineRows(basic, links, nodes, 0).every((g) => g.idle)).toBe(true);
        expect(buildTimelineRows({ streams: [] }, links, nodes, 1000).every((g) => g.idle)).toBe(true);
    });
});

describe('assignLanes', () => {
    const bar = (startNs: number, rxEndNs: number): TimelineBar => ({
        key: `${startNs}`, streamId: 's', hopIndex: 0, instance: 0,
        hop: hop('ab', 'a', 'b', 0, 0, 0), startNs, txEndNs: startNs, rxEndNs, lane: 0,
    });

    it('reuses a lane once it is free and shares the last lane beyond the cap', () => {
        const bars = [bar(0, 10), bar(5, 15), bar(10, 20), bar(12, 22), bar(13, 23), bar(14, 24)];
        const count = assignLanes(bars);
        expect(count).toBe(MAX_LANES);
        expect(bars.map((b) => b.lane)).toEqual([0, 1, 0, 2, 3, 3]);
        expect(assignLanes([])).toBe(1);
    });
});

describe('ruler', () => {
    it('picks 1/2/5 steps', () => {
        expect(niceStep(1000, 5)).toBe(200);
        expect(niceStep(4_000_000, 8)).toBe(500_000);
        expect(niceStep(1000, 10)).toBe(100);
        expect(niceStep(3, 10)).toBe(1); // never below 1 ns
    });

    it('formats µs with grouping and decimals', () => {
        expect(formatUs(1_234_500)).toBe('1 234.5');
        expect(formatUs(500_000, 0)).toBe('500');
        expect(formatUs(200, 1)).toBe('0.2');
        expect(formatUs(50, 2)).toBe('0.05');
    });

    it('builds integer ticks with labelled majors inside the window', () => {
        const ticks = niceTicks(1000, 5);
        const majors = ticks.filter((t) => t.major);
        expect(majors.map((t) => t.ns)).toEqual([0, 200, 400, 600, 800, 1000]);
        expect(majors.map((t) => t.label)).toEqual(['0.0', '0.2', '0.4', '0.6', '0.8', '1.0']);
        expect(ticks.filter((t) => !t.major).every((t) => t.label === '' && Number.isInteger(t.ns))).toBe(true);
        expect(ticks[1].ns).toBe(50); // minor = step / 4 for mantissa 2
        expect(Math.max(...ticks.map((t) => t.ns))).toBeLessThanOrEqual(1000);
    });

    it('keeps the major count near the target for various windows', () => {
        for (const windowNs of [1000, 12_345, 1_000_000, 4_000_000, 143_000_000]) {
            const majors = niceTicks(windowNs, 8).filter((t) => t.major).length;
            expect(majors).toBeGreaterThanOrEqual(4);
            expect(majors).toBeLessThanOrEqual(17);
        }
        expect(niceTicks(0, 5)).toEqual([]);
        expect(niceTicks(4_000_000, 8).filter((t) => t.major).map((t) => t.label).slice(0, 3)).toEqual(['0', '500', '1 000']);
    });
});
