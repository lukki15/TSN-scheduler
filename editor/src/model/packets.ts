import type { Schedule } from './schedule';
import type { LinkId, StreamId } from './types';

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
