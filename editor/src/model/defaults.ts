import type { EdgeData, StreamSpec } from './types';

/** Values match network-scheduler/examples/{graphml.xml,streams.json}. */
export const DEFAULT_PRECISION = 0.1;

export const DEFAULT_LINK: EdgeData = {
    length: 10,
    bandwidth: 1000,
};

export const DEFAULT_STREAM: Omit<StreamSpec, 'name' | 'start_node' | 'end_node'> = {
    message_size: 10_000,
    period_ns: 1_000_000,
    e2e_latency_ns: 500_000,
    max_jitter_ns: 1_000,
};

export const NODE_ID_PREFIX = 'n';
export const STREAM_NAME_PREFIX = 'stream';

/** Unit hints shown next to form fields. The Rust code documents no units; these are the working assumption. */
export const UNITS = {
    length: 'm',
    bandwidth: 'Mbit/s',
    message_size: 'bytes',
    period_ns: 'ns',
    e2e_latency_ns: 'ns',
    max_jitter_ns: 'ns',
} as const;
