import { describe, expect, it, vi } from 'vitest';
import type { GraphLink, Stream } from '../model/types';
import { runSchedulerWasm, SimulationClient } from '../simulation/wasm';

const mockSnapshot = {
    elapsed_time_ns: 0,
    phase_time_ns: 0,
    hyperperiod_ns: 10_000,
    status: 'stopped',
    frames: [],
    stats: { generated_frames: 0, active_frames: 0, completed_frames: 0, dropped_frames: 0 },
};

vi.mock('scheduler-wasm', () => ({
    default: vi.fn(async () => undefined),
    Simulation: vi.fn(function (this: Record<string, unknown>) {
        this.free = vi.fn();
        this.load_schedule = vi.fn();
        this.start = vi.fn();
        this.pause = vi.fn();
        this.step = vi.fn(() => mockSnapshot);
        this.advance_to = vi.fn(() => mockSnapshot);
        this.reset = vi.fn(() => mockSnapshot);
        this.snapshot = vi.fn(() => mockSnapshot);
        this.stats = vi.fn(() => mockSnapshot.stats);
    }),
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

    it('keeps one Rust instance for lifecycle, time, snapshot, and stats calls', async () => {
        const client = new SimulationClient();
        const streams: Stream[] = [{
            id: 's', name: 's', message_size: 128, period_ns: 10_000,
            e2e_latency_ns: 0, max_jitter_ns: 0, start_node: 'a', end_node: 'c',
            hue: 120, route: ['a', 'b', 'c'], status: 'ok',
        }];
        const links: GraphLink[] = [{
            id: 'ab', source: 'a', target: 'b',
            data: { id: 'ab', length: 100, bandwidth: 1000 },
        }];

        await client.install(streams, links, { streams: [] });
        client.start();
        client.pause();
        client.step();
        client.advanceTo(100);
        client.reset();
        client.snapshot();
        client.stats();

        const { Simulation } = await import('scheduler-wasm');
        const constructor = Simulation as unknown as {
            mock: { results: { value: Record<string, ReturnType<typeof vi.fn>> }[] };
        };
        const instance = constructor.mock.results[0].value;
        expect(instance.load_schedule).toHaveBeenCalledOnce();
        expect(instance.start).toHaveBeenCalledOnce();
        expect(instance.pause).toHaveBeenCalledOnce();
        expect(instance.step).toHaveBeenCalledOnce();
        expect(instance.advance_to).toHaveBeenCalledWith(100);
        expect(instance.reset).toHaveBeenCalledOnce();
        expect(instance.snapshot).toHaveBeenCalledTimes(4);
        expect(instance.stats).toHaveBeenCalledOnce();
    });
});
