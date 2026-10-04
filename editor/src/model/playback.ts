import { formatUs } from './timeline';

/**
 * Playback clock. Simulation time is *derived* from an anchor rather than
 * ticked, so pausing, resuming and scale changes never accumulate drift and no
 * per-frame state updates are needed: `timeAt(playback, now)` is pure.
 *
 * The time scale is expressed as simulated nanoseconds per real second and
 * moves on an exponential dial, because TSN frames span three orders of
 * magnitude: 1 kB on 1 Gbit/s occupies the wire for 8 µs, 64 kB on 100 Mbit/s
 * for about 5 ms.
 */

export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

/** Simulated ns per real second, 1-2-5 steps from 5 µs/s (10 µs per 2 s) to 5 ms/s (10 ms per 2 s). */
export const SCALE_STEPS_NS_PER_S: readonly number[] = [
    5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000,
];
/** 1 ms of simulated time per 2 s of watching. */
export const DEFAULT_SCALE_NS_PER_S = 500_000;

export interface Playback {
    status: PlaybackStatus;
    /** Simulated ns per real second; always one of `SCALE_STEPS_NS_PER_S`. */
    scaleNsPerS: number;
    /** Simulation time (ns) at the anchor. */
    anchorTimeNs: number;
    /** Wall-clock (ms, `performance.now()`) at the anchor; meaningful only while playing. */
    anchorWallMs: number;
}

export const INITIAL_PLAYBACK: Playback = {
    status: 'stopped',
    scaleNsPerS: DEFAULT_SCALE_NS_PER_S,
    anchorTimeNs: 0,
    anchorWallMs: 0,
};

/** Nearest step in log space, clamped to the dial's range. */
export function nearestScale(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_SCALE_NS_PER_S;
    const target = Math.log(value);
    let best = SCALE_STEPS_NS_PER_S[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const step of SCALE_STEPS_NS_PER_S) {
        const distance = Math.abs(Math.log(step) - target);
        if (distance < bestDistance) {
            best = step;
            bestDistance = distance;
        }
    }
    return best;
}

/** Index of a scale within `SCALE_STEPS_NS_PER_S` (after snapping). */
export function scaleIndex(scaleNsPerS: number): number {
    return SCALE_STEPS_NS_PER_S.indexOf(nearestScale(scaleNsPerS));
}

/** `5 µs/s`, `500 µs/s`, `1 ms/s`, `5 ms/s`. */
export function formatScale(scaleNsPerS: number): string {
    const us = scaleNsPerS / 1000;
    return us >= 1000 ? `${Number((us / 1000).toPrecision(3))} ms/s` : `${Number(us.toPrecision(3))} µs/s`;
}

export function timeAt(p: Playback, nowMs: number): number {
    if (p.status !== 'playing') return p.anchorTimeNs;
    return p.anchorTimeNs + (Math.max(0, nowMs - p.anchorWallMs) * p.scaleNsPerS) / 1000;
}

export function play(p: Playback, nowMs: number): Playback {
    if (p.status === 'playing') return p;
    return { ...p, status: 'playing', anchorWallMs: nowMs };
}

export function pause(p: Playback, nowMs: number): Playback {
    if (p.status !== 'playing') return p;
    return { ...p, status: 'paused', anchorTimeNs: timeAt(p, nowMs), anchorWallMs: nowMs };
}

export function stop(p: Playback): Playback {
    return { ...p, status: 'stopped', anchorTimeNs: 0, anchorWallMs: 0 };
}

/** Snaps to the nearest step and re-anchors at `nowMs` first so the clock does not jump mid-run. */
export function setScale(p: Playback, scaleNsPerS: number, nowMs: number): Playback {
    const scale = nearestScale(scaleNsPerS);
    if (scale === p.scaleNsPerS) return p;
    return { ...p, scaleNsPerS: scale, anchorTimeNs: timeAt(p, nowMs), anchorWallMs: nowMs };
}

/**
 * Jumps to `timeNs` (clamped at 0) and re-anchors at `nowMs`. Playing keeps
 * playing from the new time; a stopped clock becomes paused so the canvas
 * renders the frames at that instant instead of nothing.
 */
export function seek(p: Playback, timeNs: number, nowMs: number): Playback {
    const anchorTimeNs = Math.max(0, timeNs);
    const status: PlaybackStatus = p.status === 'stopped' ? 'paused' : p.status;
    return { ...p, status, anchorTimeNs, anchorWallMs: nowMs };
}

/** `t = 1 234.5 µs` with thin-space thousands grouping and one decimal. */
export function formatSimTime(ns: number): string {
    return `t = ${formatUs(Math.max(0, ns), 1)} µs`;
}

export function periodIndex(timeNs: number, periodNs: number): number {
    if (periodNs <= 0) return 0;
    return Math.floor(Math.max(0, timeNs) / periodNs);
}
