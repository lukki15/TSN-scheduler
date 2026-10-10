import init, { run_mock_simulation } from 'scheduler-wasm';
import { defaultScheduler, type Schedule } from '../model/schedule';
import type { GraphLink, Stream } from '../model/types';

const wasmInit = (() => {
    let promise: Promise<void> | null = null;
    return () => {
        if (promise) return promise;
        promise = init().then(() => undefined).catch((error) => {
            console.error('[scheduler-wasm] initialization failed', error);
            throw error;
        });
        return promise;
    };
})();

export type WasmSimulationRequest = {
    streams: Array<{
        id: string;
        message_size: number;
        period_ns: number;
        route: string[];
        status: string;
    }>;
    links: Array<{
        id: string;
        source: string;
        target: string;
        length_m: number;
        bandwidth_mbps: number;
    }>;
};

export function toWasmSimulationRequest(streams: readonly Stream[], links: readonly GraphLink[]): WasmSimulationRequest {
    return {
        streams: streams.map((stream) => ({
            id: stream.id,
            message_size: stream.message_size,
            period_ns: stream.period_ns,
            route: stream.route,
            status: stream.status,
        })),
        links: links.map((link) => ({
            id: link.id,
            source: link.source,
            target: link.target,
            length_m: link.data.length,
            bandwidth_mbps: link.data.bandwidth,
        })),
    };
}

export async function runSchedulerWasm(streams: readonly Stream[], links: readonly GraphLink[]): Promise<Schedule> {
    try {
        await wasmInit();
        const request = toWasmSimulationRequest(streams, links);
        const result = run_mock_simulation(JSON.stringify(request));
        return JSON.parse(result) as Schedule;
    } catch (error) {
        console.warn('[scheduler-wasm] falling back to TypeScript mock schedule', error);
        return defaultScheduler.schedule(streams, links);
    }
}
