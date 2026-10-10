import { describe, expect, it, vi } from 'vitest';
import type { GraphLink, Stream } from '../model/types';
import { runSchedulerWasm } from '../simulation/wasm';

vi.mock('scheduler-wasm', () => ({
    default: vi.fn(async () => undefined),
    run_mock_simulation: vi.fn(() => JSON.stringify({
        streams: [{
            stream_id: 's',
            period_ns: 10_000,
            hops: [
                { link_id: 'ab', from: 'a', to: 'b', tx_start_ns: 0, tx_end_ns: 1024, rx_end_ns: 1074 },
                { link_id: 'bc', from: 'b', to: 'c', tx_start_ns: 1074, tx_end_ns: 2098, rx_end_ns: 2148 },
            ],
        }],
    })),
}));

describe('runSchedulerWasm', () => {
    it('returns a schedule for a simple routed topology from the Rust simulator', async () => {
        const streams: Stream[] = [{
            id: 's',
            name: 's',
            message_size: 128,
            period_ns: 10_000,
            e2e_latency_ns: 0,
            max_jitter_ns: 0,
            start_node: 'a',
            end_node: 'c',
            hue: 120,
            route: ['a', 'b', 'c'],
            status: 'ok',
        }];

        const links: GraphLink[] = [
            {
                id: 'ab',
                source: 'a',
                target: 'b',
                data: { id: 'ab', length: 100, bandwidth: 1000 },
            },
            {
                id: 'bc',
                source: 'b',
                target: 'c',
                data: { id: 'bc', length: 200, bandwidth: 1000 },
            },
        ];

        const actual = await runSchedulerWasm(streams, links);

        expect(actual.streams).toHaveLength(1);
        expect(actual.streams[0].stream_id).toBe('s');
        expect(actual.streams[0].hops).toHaveLength(2);
        expect(actual.streams[0].hops[0].link_id).toBe('ab');
        expect(actual.streams[0].hops[1].link_id).toBe('bc');
    });
});
