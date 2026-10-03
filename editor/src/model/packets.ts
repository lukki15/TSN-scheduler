import type { HopSchedule, Schedule, StreamSchedule } from './schedule';
import type { LinkDirection, LinkId, NodeKey, StreamId } from './types';

export type PacketPhase = 'tx' | 'propagating';

export interface PacketPosition {
    stream_id: StreamId;
    link_id: LinkId;
    /** Period index k of this transmission. */
    instance: number;
    /** `'forward'` when the packet travels source → target of the link. */
    direction: LinkDirection;
    /** 0..1 along from → to over [tx_start, rx_end]. */
    progress: number;
    /** Still leaving the sender, or fully on the wire. */
    phase: PacketPhase;
    /** 0..1 over the whole route of this transmission (for fade effects). */
    routeProgress: number;
}

/** Upper bound of overlapping transmissions per stream, guarding tiny periods with long routes. */
export const MAX_INSTANCES_IN_FLIGHT = 32;

function hopAt(hops: readonly HopSchedule[], tau: number): number {
    // hops are contiguous (next tx_start === previous rx_end), so at most one matches
    for (let i = 0; i < hops.length; i++) {
        const h = hops[i];
        if (tau >= h.tx_start_ns && tau < h.rx_end_ns) return i;
    }
    return -1;
}

function instancesOf(stream: StreamSchedule, timeNs: number): { k: number; tau: number }[] {
    const { hops, period_ns } = stream;
    if (hops.length === 0 || period_ns <= 0) return [];
    const start = hops[0].tx_start_ns;
    const end = hops[hops.length - 1].rx_end_ns;
    if (end <= start) return [];

    // instance k is in flight while k*P + start <= t < k*P + end
    const kMax = Math.floor((timeNs - start) / period_ns);
    let kMin = Math.ceil((timeNs - end) / period_ns);
    if ((timeNs - end) % period_ns === 0) kMin += 1; // t === k*P + end is already finished
    kMin = Math.max(kMin, 0, kMax - MAX_INSTANCES_IN_FLIGHT + 1);

    const result: { k: number; tau: number }[] = [];
    for (let k = kMin; k <= kMax; k++) result.push({ k, tau: timeNs - k * period_ns });
    return result;
}

/**
 * Every packet in flight at `timeNs`, across all streams of the schedule.
 * `sourceOf` maps link id → source node (see `linkSources`); callers on a hot
 * path build it once per link set.
 */
export function packetsAt(schedule: Schedule, timeNs: number, sourceOf: ReadonlyMap<LinkId, NodeKey>): PacketPosition[] {
    if (timeNs < 0) return [];
    const packets: PacketPosition[] = [];

    for (const stream of schedule.streams) {
        const { hops } = stream;
        if (hops.length === 0) continue;
        const routeStart = hops[0].tx_start_ns;
        const routeLength = hops[hops.length - 1].rx_end_ns - routeStart;

        for (const { k, tau } of instancesOf(stream, timeNs)) {
            const hopIndex = hopAt(hops, tau);
            if (hopIndex < 0) continue;
            const hop = hops[hopIndex];
            const duration = hop.rx_end_ns - hop.tx_start_ns;
            if (duration <= 0) continue;
            packets.push({
                stream_id: stream.stream_id,
                link_id: hop.link_id,
                instance: k,
                direction: sourceOf.get(hop.link_id) === hop.from ? 'forward' : 'reverse',
                progress: (tau - hop.tx_start_ns) / duration,
                phase: tau < hop.tx_end_ns ? 'tx' : 'propagating',
                routeProgress: routeLength > 0 ? (tau - routeStart) / routeLength : 1,
            });
        }
    }
    return packets;
}

export const LANE_SPACING = 10;
export const LANE_MAX_OFFSET = 20;

/**
 * Perpendicular offset (flow px) for each stream on each link, so streams that
 * share a link do not overlap. Offsets are symmetric around the link, measured
 * along the source → target normal, and bounded by ±LANE_MAX_OFFSET.
 */
export function buildLanes(schedule: Schedule): Map<LinkId, Map<StreamId, number>> {
    const perLink = new Map<LinkId, StreamId[]>();
    for (const stream of schedule.streams) {
        for (const hop of stream.hops) {
            const list = perLink.get(hop.link_id) ?? [];
            if (!list.includes(stream.stream_id)) list.push(stream.stream_id);
            perLink.set(hop.link_id, list);
        }
    }

    const lanes = new Map<LinkId, Map<StreamId, number>>();
    for (const [linkId, streamIds] of perLink) {
        const m = streamIds.length;
        const spacing = Math.min(LANE_SPACING, (2 * LANE_MAX_OFFSET) / Math.max(m - 1, 1));
        const offsets = new Map<StreamId, number>();
        streamIds.forEach((id, j) => offsets.set(id, (j - (m - 1) / 2) * spacing));
        lanes.set(linkId, offsets);
    }
    return lanes;
}
