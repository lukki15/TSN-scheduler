import type { LinkId, NodeKey, StreamId } from './types';

/**
 * Schedule model.
 *
 * Shape returned by the Rust scheduler: for every
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

