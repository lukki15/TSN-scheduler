import { DEFAULT_LINK } from './defaults';
import type { LinkId, NodeKey, StreamId } from './types';

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

