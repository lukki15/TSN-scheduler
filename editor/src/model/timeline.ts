import { displayId } from './graph';
import type { HopSchedule, Schedule } from './schedule';
import type { GraphLink, LinkDirection, LinkId, NodeKey, StreamId } from './types';

/**
 * Timeline model: the schedule laid out over one window of time (the
 * hyperperiod) as rows per link and direction. Pure functions, no DOM.
 */

/** Fall back to the longest period when the lcm exceeds this many of them. */
export const HYPERPERIOD_CAP_FACTOR = 64;
/** Bars per hop per window; guards tiny periods inside a long window. */
export const MAX_INSTANCES_PER_HOP = 256;
/** Stacked lanes per sub-row; further overlapping bars share the last lane. */
export const MAX_LANES = 4;
/** Period markers drawn for the selected stream; guards tiny periods inside a long window. */
export const MAX_PERIOD_MARKERS = 256;

export interface TimelineWindow {
    /** 0 when no stream has a positive period. */
    windowNs: number;
    capped: boolean;
    longestPeriodNs: number;
}

export function gcd(a: number, b: number): number {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
}

export function lcm(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return (a / gcd(a, b)) * b;
}

/**
 * Least common multiple of all (rounded) stream periods. Breaks out to the
 * longest period as soon as the running lcm exceeds `capFactor` × longest,
 * which also keeps the arithmetic far below Number precision limits.
 */
export function hyperperiod(schedule: Schedule, capFactor: number = HYPERPERIOD_CAP_FACTOR): TimelineWindow {
    const periods = schedule.streams.map((s) => Math.round(s.period_ns)).filter((p) => p > 0);
    if (periods.length === 0) return { windowNs: 0, capped: false, longestPeriodNs: 0 };
    const longestPeriodNs = Math.max(...periods);
    let acc = periods[0];
    for (const p of periods) {
        acc = lcm(acc, p);
        if (acc > capFactor * longestPeriodNs) return { windowNs: longestPeriodNs, capped: true, longestPeriodNs };
    }
    return { windowNs: acc, capped: false, longestPeriodNs };
}

export interface TimelineBar {
    /** `${streamId}:${hopIndex}:${instance}`, unique within the window. */
    key: string;
    streamId: StreamId;
    hopIndex: number;
    hop: HopSchedule;
    /** Period index k; negative for a tail of the previous window still in flight at t = 0. */
    instance: number;
    /** Absolute ns within the window (k·P + offset); may be < 0 or > windowNs, the renderer clips. */
    startNs: number;
    txEndNs: number;
    rxEndNs: number;
    /** 0-based stacking lane within the sub-row. */
    lane: number;
}

export interface TimelineSubRow {
    /** `'forward'` = link.source → link.target. */
    direction: LinkDirection;
    from: NodeKey;
    to: NodeKey;
    /** `from → to` as TSN ids, `?` for unknown nodes. */
    label: string;
    /** Sorted by startNs. */
    bars: TimelineBar[];
    laneCount: number;
    truncated: boolean;
}

export interface TimelineRowGroup {
    linkId: LinkId;
    /** `n1 ↔ n2` from node ids, `?` for unknown nodes. */
    label: string;
    /** No bar in either direction. */
    idle: boolean;
    rows: [TimelineSubRow, TimelineSubRow];
}

/**
 * Greedy interval partitioning over [startNs, rxEndNs): each bar takes the
 * first lane that is free, up to `maxLanes`; the rest share the last lane.
 * Mutates `lane` and returns the lane count (at least 1).
 */
export function assignLanes(bars: TimelineBar[], maxLanes: number = MAX_LANES): number {
    const laneEnds: number[] = [];
    for (const bar of bars) {
        let lane = laneEnds.findIndex((end) => end <= bar.startNs);
        if (lane === -1) {
            if (laneEnds.length < maxLanes) {
                lane = laneEnds.length;
                laneEnds.push(bar.rxEndNs);
            } else {
                lane = maxLanes - 1;
                laneEnds[lane] = Math.max(laneEnds[lane], bar.rxEndNs);
            }
        } else {
            laneEnds[lane] = bar.rxEndNs;
        }
        bar.lane = lane;
    }
    return Math.max(1, laneEnds.length);
}

/**
 * One row group per link, in link order, with every transmission instance that
 * touches the window. `nodeIds` maps node keys to TSN ids (see `nodeDisplayIds`).
 */
export function buildTimelineRows(
    schedule: Schedule,
    links: readonly GraphLink[],
    nodeIds: Record<NodeKey, string>,
    windowNs: number,
): TimelineRowGroup[] {
    const name = (key: NodeKey) => displayId(nodeIds, key);
    const subRow = (direction: LinkDirection, from: NodeKey, to: NodeKey): TimelineSubRow => ({
        direction, from, to, label: `${name(from)} → ${name(to)}`, bars: [], laneCount: 1, truncated: false,
    });

    const groups = new Map<LinkId, TimelineRowGroup>();
    for (const link of links) {
        groups.set(link.id, {
            linkId: link.id,
            label: `${name(link.source)} ↔ ${name(link.target)}`,
            idle: true,
            rows: [subRow('forward', link.source, link.target), subRow('reverse', link.target, link.source)],
        });
    }

    if (windowNs > 0) {
        for (const stream of schedule.streams) {
            const P = stream.period_ns;
            if (P <= 0) continue;
            stream.hops.forEach((hop, hopIndex) => {
                const group = groups.get(hop.link_id);
                if (!group) return;
                const sub = hop.from === group.rows[0].from ? group.rows[0] : group.rows[1];

                const kMin = Math.ceil(-hop.rx_end_ns / P) + 0; // + 0 turns Math.ceil's -0 into 0
                let kMax = Math.ceil((windowNs - hop.tx_start_ns) / P) - 1;
                if (kMax - kMin + 1 > MAX_INSTANCES_PER_HOP) {
                    kMax = kMin + MAX_INSTANCES_PER_HOP - 1;
                    sub.truncated = true;
                }
                for (let k = kMin; k <= kMax; k++) {
                    sub.bars.push({
                        key: `${stream.stream_id}:${hopIndex}:${k}`,
                        streamId: stream.stream_id,
                        hopIndex,
                        hop,
                        instance: k,
                        startNs: k * P + hop.tx_start_ns,
                        txEndNs: k * P + hop.tx_end_ns,
                        rxEndNs: k * P + hop.rx_end_ns,
                        lane: 0,
                    });
                }
            });
        }
    }

    for (const group of groups.values()) {
        for (const sub of group.rows) {
            sub.bars.sort((a, b) => a.startNs - b.startNs);
            sub.laneCount = assignLanes(sub.bars);
        }
        group.idle = group.rows[0].bars.length === 0 && group.rows[1].bars.length === 0;
    }
    return [...groups.values()];
}

/** Window positions of the period boundaries of a stream (excluding 0 and the window end). */
export function periodMarkers(periodNs: number, windowNs: number): number[] {
    const markers: number[] = [];
    if (periodNs <= 0 || windowNs <= 0) return markers;
    for (let ns = periodNs; ns < windowNs && markers.length < MAX_PERIOD_MARKERS; ns += periodNs) markers.push(ns);
    return markers;
}

// ─── Ruler ───────────────────────────────────────────────────────────────────

export interface Tick {
    ns: number;
    /** Empty for minor ticks. */
    label: string;
    major: boolean;
}

/** 1 / 2 / 5 × 10^n step in whole ns so that about `targetCount` major ticks fit into `rangeNs`. */
export function niceStep(rangeNs: number, targetCount: number): number {
    if (rangeNs <= 0 || targetCount <= 0) return 1;
    const raw = rangeNs / targetCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) {
        const step = m * magnitude;
        if (step >= raw) return Math.max(1, Math.round(step));
    }
    return Math.max(1, Math.round(10 * magnitude));
}

function decimalsFor(stepNs: number): number {
    if (stepNs >= 1000) return 0;
    return Math.max(0, 3 - Math.floor(Math.log10(stepNs)));
}

/** µs with space grouping of thousands and a fixed number of decimals. */
export function formatUs(ns: number, decimals: number = 1): string {
    const [whole, frac] = (ns / 1000).toFixed(decimals).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/**
 * Major ticks at multiples of the nice step from 0 to ≤ windowNs, with minor
 * ticks between them (step / 5, or step / 4 when the mantissa is 2). All tick
 * positions are integers computed as i × step, never accumulated.
 */
export function niceTicks(windowNs: number, targetCount: number): Tick[] {
    if (windowNs <= 0) return [];
    const step = niceStep(windowNs, targetCount);
    const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)));
    const divisions = Math.abs(mantissa - 2) < 1e-9 ? 4 : 5;
    const minor = step % divisions === 0 ? step / divisions : 0;
    const unit = minor || step;
    const decimals = decimalsFor(step);

    const ticks: Tick[] = [];
    for (let i = 0; i * unit <= windowNs; i++) {
        const ns = i * unit;
        const major = ns % step === 0;
        ticks.push({ ns, major, label: major ? formatUs(ns, decimals) : '' });
    }
    return ticks;
}
