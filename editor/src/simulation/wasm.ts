import init, { run_mock_simulation, Simulation as WasmSimulation } from 'scheduler-wasm';
import type { Schedule } from '../model/schedule';
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

export interface SimulationFrame {
    stream_id: string;
    link_id: string;
    instance: number;
    direction: 'forward' | 'reverse';
    progress: number;
    head: number;
    tail: number;
    phase: 'tx' | 'propagating';
    route_progress: number;
}

export interface SimulationStats {
    generated_frames: number;
    active_frames: number;
    completed_frames: number;
    dropped_frames: number;
}

export interface SimulationSnapshot {
    elapsed_time_ns: number;
    phase_time_ns: number;
    hyperperiod_ns: number;
    status: 'stopped' | 'running' | 'paused';
    frames: SimulationFrame[];
    stats: SimulationStats;
}

export class SimulationClient {
    private engine: WasmSimulation | null = null;
    private generation = 0;

    get ready(): boolean {
        return this.engine !== null;
    }

    clear(): void {
        this.generation++;
        this.engine?.free();
        this.engine = null;
    }

    async install(
        streams: readonly Stream[],
        links: readonly GraphLink[],
        schedule: Schedule,
    ): Promise<SimulationSnapshot | null> {
        const generation = ++this.generation;
        await wasmInit();
        if (generation !== this.generation) return null;

        const engine = new WasmSimulation(toWasmSimulationRequest(streams, links));
        try {
            engine.load_schedule(schedule);
            if (generation !== this.generation) {
                engine.free();
                return null;
            }
            this.engine?.free();
            this.engine = engine;
            return engine.snapshot() as SimulationSnapshot;
        } catch (error) {
            engine.free();
            throw error;
        }
    }

    start(): SimulationSnapshot | null {
        if (!this.engine) return null;
        this.engine.start();
        return this.snapshot();
    }

    pause(): SimulationSnapshot | null {
        if (!this.engine) return null;
        this.engine.pause();
        return this.snapshot();
    }

    step(): SimulationSnapshot | null {
        if (!this.engine) return null;
        return this.engine.step() as SimulationSnapshot;
    }

    advanceTo(timeNs: number): SimulationSnapshot | null {
        if (!this.engine) return null;
        return this.engine.advance_to(timeNs) as SimulationSnapshot;
    }

    reset(): SimulationSnapshot | null {
        if (!this.engine) return null;
        return this.engine.reset() as SimulationSnapshot;
    }

    snapshot(): SimulationSnapshot | null {
        if (!this.engine) return null;
        return this.engine.snapshot() as SimulationSnapshot;
    }

    stats(): SimulationStats | null {
        if (!this.engine) return null;
        return this.engine.stats() as SimulationStats;
    }
}

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
    await wasmInit();
    const request = toWasmSimulationRequest(streams, links);
    const result = run_mock_simulation(JSON.stringify(request));
    return JSON.parse(result) as Schedule;
}
