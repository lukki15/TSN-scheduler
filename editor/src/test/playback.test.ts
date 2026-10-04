import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SCALE_NS_PER_S,
    INITIAL_PLAYBACK,
    SCALE_STEPS_NS_PER_S,
    formatScale,
    formatSimTime,
    nearestScale,
    pause,
    periodIndex,
    play,
    scaleIndex,
    seek,
    setScale,
    stop,
    timeAt,
} from '../model/playback';

const SLOWEST_SCALE_NS_PER_S = SCALE_STEPS_NS_PER_S[0];
const FASTEST_SCALE_NS_PER_S = SCALE_STEPS_NS_PER_S[SCALE_STEPS_NS_PER_S.length - 1];

describe('time scale', () => {
    it('spans 10 µs to 10 ms per 2 s in 1-2-5 steps with 1 ms per 2 s as default', () => {
        expect(SLOWEST_SCALE_NS_PER_S).toBe(5_000);
        expect(FASTEST_SCALE_NS_PER_S).toBe(5_000_000);
        expect(DEFAULT_SCALE_NS_PER_S).toBe(500_000);
        expect(SCALE_STEPS_NS_PER_S).toHaveLength(10);
        expect(INITIAL_PLAYBACK.scaleNsPerS).toBe(DEFAULT_SCALE_NS_PER_S);
        for (let i = 1; i < SCALE_STEPS_NS_PER_S.length; i++) {
            expect(SCALE_STEPS_NS_PER_S[i]).toBeGreaterThan(SCALE_STEPS_NS_PER_S[i - 1]);
        }
    });

    it('snaps to the nearest step in log space and clamps to the range', () => {
        expect(nearestScale(7_000)).toBe(5_000);
        expect(nearestScale(7_100)).toBe(10_000);
        expect(nearestScale(740_000)).toBe(1_000_000);
        expect(nearestScale(600_000)).toBe(500_000);
        expect(nearestScale(1)).toBe(SLOWEST_SCALE_NS_PER_S);
        expect(nearestScale(1e12)).toBe(FASTEST_SCALE_NS_PER_S);
        expect(nearestScale(Number.NaN)).toBe(DEFAULT_SCALE_NS_PER_S);
        expect(nearestScale(-5)).toBe(DEFAULT_SCALE_NS_PER_S);
        expect(scaleIndex(500_000)).toBe(6);
        expect(scaleIndex(740_000)).toBe(7);
    });

    it('formats as simulated time per real second', () => {
        expect(SCALE_STEPS_NS_PER_S.map(formatScale)).toEqual([
            '5 µs/s', '10 µs/s', '20 µs/s', '50 µs/s', '100 µs/s', '200 µs/s', '500 µs/s', '1 ms/s', '2 ms/s', '5 ms/s',
        ]);
    });
});

describe('playback clock', () => {
    it('stays at the anchor while stopped or paused', () => {
        expect(timeAt(INITIAL_PLAYBACK, 5000)).toBe(0);
        const paused = { ...INITIAL_PLAYBACK, status: 'paused' as const, anchorTimeNs: 1234 };
        expect(timeAt(paused, 99_999)).toBe(1234);
    });

    it('advances by the scale while playing', () => {
        const p = play(INITIAL_PLAYBACK, 1000);
        expect(timeAt(p, 2000)).toBe(500_000); // default: 1 ms per 2 s
        expect(timeAt({ ...p, scaleNsPerS: SLOWEST_SCALE_NS_PER_S }, 3000)).toBe(10_000); // 10 µs per 2 s
        expect(timeAt({ ...p, scaleNsPerS: FASTEST_SCALE_NS_PER_S }, 3000)).toBe(10_000_000); // 10 ms per 2 s
        expect(timeAt(p, 500)).toBe(0); // clock never runs backwards
    });

    it('pauses and resumes without a jump', () => {
        const playing = play(INITIAL_PLAYBACK, 0);
        const paused = pause(playing, 1000);
        expect(paused.status).toBe('paused');
        expect(timeAt(paused, 5000)).toBe(500_000);
        const resumed = play(paused, 5000);
        expect(timeAt(resumed, 5000)).toBe(500_000);
        expect(timeAt(resumed, 6000)).toBe(1_000_000);
        expect(pause(paused, 7000)).toBe(paused);
        expect(play(resumed, 8000)).toBe(resumed);
    });

    it('changes scale without a jump and snaps the value', () => {
        const playing = play(INITIAL_PLAYBACK, 0);
        const faster = setScale(playing, 2_000_000, 1000);
        expect(faster.scaleNsPerS).toBe(2_000_000);
        expect(timeAt(faster, 1000)).toBe(500_000);
        expect(timeAt(faster, 2000)).toBe(2_500_000);
        expect(setScale(faster, 2_000_000, 3000)).toBe(faster);
        expect(setScale(faster, 2_100_000, 3000)).toBe(faster); // snaps to the same step
        const whilePaused = setScale(pause(playing, 1000), 5_000, 2000);
        expect(whilePaused.scaleNsPerS).toBe(5_000);
        expect(timeAt(whilePaused, 9000)).toBe(500_000);
    });

    it('seeks while keeping the status, except stopped which becomes paused', () => {
        const playing = play(INITIAL_PLAYBACK, 0);
        const sought = seek(playing, 250_000, 1000);
        expect(sought.status).toBe('playing');
        expect(timeAt(sought, 1000)).toBe(250_000);
        expect(timeAt(sought, 2000)).toBe(750_000);

        const paused = seek(pause(playing, 500), 10, 600);
        expect(paused).toMatchObject({ status: 'paused', anchorTimeNs: 10 });

        const fromStopped = seek(INITIAL_PLAYBACK, 123, 0);
        expect(fromStopped.status).toBe('paused');
        expect(timeAt(fromStopped, 99_999)).toBe(123);

        expect(seek(INITIAL_PLAYBACK, -5, 0).anchorTimeNs).toBe(0);
    });

    it('stops back to zero and keeps the scale', () => {
        const stopped = stop(setScale(play(INITIAL_PLAYBACK, 0), 5_000, 100));
        expect(stopped).toMatchObject({ status: 'stopped', anchorTimeNs: 0, scaleNsPerS: 5_000 });
        expect(timeAt(stopped, 10_000)).toBe(0);
    });

    it('formats simulation time in µs with grouping', () => {
        expect(formatSimTime(0)).toBe('t = 0.0 µs');
        expect(formatSimTime(1_234_500)).toBe('t = 1 234.5 µs');
        expect(formatSimTime(1_234_567_890)).toBe('t = 1 234 567.9 µs');
        expect(formatSimTime(-5)).toBe('t = 0.0 µs');
    });

    it('computes the period index', () => {
        expect(periodIndex(0, 1000)).toBe(0);
        expect(periodIndex(2999, 1000)).toBe(2);
        expect(periodIndex(3000, 1000)).toBe(3);
        expect(periodIndex(500, 0)).toBe(0);
    });
});
