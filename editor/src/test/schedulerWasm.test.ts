import { describe, expect, it } from 'vitest';
import { defaultScheduler } from '../model/schedule';
import type { GraphLink, Stream } from '../model/types';
import { runSchedulerWasm } from '../simulation/wasm';

describe('runSchedulerWasm', () => {
    it('matches the current mock schedule contract for a simple topology', async () => {
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

        const expected = defaultScheduler.schedule(streams, links);
        const actual = await runSchedulerWasm(streams, links);

        expect(actual).toEqual(expected);
    });
});
