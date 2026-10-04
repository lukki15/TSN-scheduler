/**
 * Playback clock. Simulation time is *derived* from an anchor rather than
 * ticked, so pausing, resuming and speed changes never accumulate drift and no
 * per-frame state updates are needed: `timeAt(playback, now)` is pure.
 */

export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Slow motion: 1 ms of simulated time takes 2 s of wall-clock at 1x. */
export const SIM_NS_PER_WALL_MS = 500;

export interface Playback {
    status: PlaybackStatus;
    speed: Speed;
    /** Simulation time (ns) at the anchor. */
    anchorTimeNs: number;
    /** Wall-clock (ms, `performance.now()`) at the anchor; meaningful only while playing. */
    anchorWallMs: number;
}

export const INITIAL_PLAYBACK: Playback = { status: 'stopped', speed: 1, anchorTimeNs: 0, anchorWallMs: 0 };

export function timeAt(p: Playback, nowMs: number): number {
    if (p.status !== 'playing') return p.anchorTimeNs;
    return p.anchorTimeNs + Math.max(0, nowMs - p.anchorWallMs) * SIM_NS_PER_WALL_MS * p.speed;
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

/** Re-anchors at `nowMs` first so the clock does not jump when the speed changes mid-run. */
export function setSpeed(p: Playback, speed: Speed, nowMs: number): Playback {
    if (speed === p.speed) return p;
    return { ...p, speed, anchorTimeNs: timeAt(p, nowMs), anchorWallMs: nowMs };
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
    const us = Math.max(0, ns) / 1000;
    const [whole, frac] = us.toFixed(1).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `t = ${grouped}.${frac} µs`;
}

export function periodIndex(timeNs: number, periodNs: number): number {
    if (periodNs <= 0) return 0;
    return Math.floor(Math.max(0, timeNs) / periodNs);
}
