import { DEFAULT_LINK } from './defaults';
import { indexLinks } from './graph';
import type { GraphLink, LinkId, NodeKey, Stream, StreamId } from './types';

/**
 * Schedule model.
 *
 * Shaped like the output the Rust scheduler will eventually produce: for every
 * stream, one transmission per period described hop by hop. All times are ns
 * offsets from the start of the stream's period; a hop may end after
 * `period_ns`, in which case consecutive transmissions overlap in flight.
 */

export interface HopSchedule {
    link_id: LinkId;
    from: NodeKey;
    to: NodeKey;
    /** Frame starts leaving `from`. */
    tx_start_ns: number;
    /** Last bit has left `from` (tx_start + transmission duration). */
    tx_end_ns: number;
    /** Last bit has arrived at `to` (tx_end + propagation delay). The next hop starts here. */
    rx_end_ns: number;
}

export interface StreamSchedule {
    stream_id: StreamId;
    period_ns: number;
    hops: HopSchedule[];
}

export interface Schedule {
    streams: StreamSchedule[];
}

/** Pluggable like RoutingStrategy; the Rust scheduler's output will be adapted to this interface. */
export interface Scheduler {
    readonly name: string;
    schedule(streams: readonly Stream[], links: readonly GraphLink[]): Schedule;
}

export const EMPTY_SCHEDULE: Schedule = Object.freeze({ streams: [] }) as Schedule;

/** Signal propagation speed assumption for copper/fibre. */
export const PROPAGATION_NS_PER_M = 5;

/** Time to put `messageSizeBytes` on a link of `bandwidthMbps`, in ns. Invalid bandwidth falls back to the default link. */
export function transmissionNs(messageSizeBytes: number, bandwidthMbps: number): number {
    const bandwidth = Number.isFinite(bandwidthMbps) && bandwidthMbps > 0 ? bandwidthMbps : DEFAULT_LINK.bandwidth;
    const bits = Math.max(0, messageSizeBytes) * 8;
    return (bits * 1000) / bandwidth;
}

export function propagationNs(lengthM: number): number {
    return Math.max(0, Number.isFinite(lengthM) ? lengthM : 0) * PROPAGATION_NS_PER_M;
}

/** Stream `index` of `count` transmits at `index / count` of its period, spreading streams across the period. */
export function streamOffsetNs(index: number, count: number, periodNs: number): number {
    if (count <= 0) return 0;
    return Math.floor((index / count) * periodNs);
}

/**
 * Mock scheduler: deterministic, side-effect free, store-and-forward along the
 * stream's computed route. Indices are taken over all streams in array order
 * (creation order) so offsets do not shuffle when a stream becomes unroutable.
 */
export const mockScheduler: Scheduler = {
    name: 'mock-spread',
    schedule(streams, links) {
        const result: StreamSchedule[] = [];
        const count = streams.length;
        const linkBetween = indexLinks(links);

        streams.forEach((stream, index) => {
            if (stream.status !== 'ok' || stream.period_ns <= 0 || stream.route.length < 2) return;

            const hops: HopSchedule[] = [];
            let t = streamOffsetNs(index, count, stream.period_ns);

            for (let i = 0; i + 1 < stream.route.length; i++) {
                const from = stream.route[i];
                const to = stream.route[i + 1];
                const link = linkBetween(from, to);
                if (!link) return; // stale route: skip the stream until it is recomputed
                const tx_start_ns = t;
                const tx_end_ns = tx_start_ns + transmissionNs(stream.message_size, link.data.bandwidth);
                const rx_end_ns = tx_end_ns + propagationNs(link.data.length);
                hops.push({ link_id: link.id, from, to, tx_start_ns, tx_end_ns, rx_end_ns });
                t = rx_end_ns;
            }

            result.push({ stream_id: stream.id, period_ns: stream.period_ns, hops });
        });

        return result.length === 0 ? EMPTY_SCHEDULE : { streams: result };
    },
};

export const defaultScheduler: Scheduler = mockScheduler;
