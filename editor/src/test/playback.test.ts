import { describe, expect, it } from 'vitest';
import {
    INITIAL_PLAYBACK,
    SIM_NS_PER_WALL_MS,
    formatSimTime,
    pause,
    periodIndex,
    play,
    seek,
    setSpeed,
    stop,
    timeAt,
} from '../model/playback';

describe('playback clock', () => {
    it('stays at the anchor while stopped or paused', () => {
        expect(timeAt(INITIAL_PLAYBACK, 5000)).toBe(0);
        const paused = { ...INITIAL_PLAYBACK, status: 'paused' as const, anchorTimeNs: 1234 };
        expect(timeAt(paused, 99_999)).toBe(1234);
    });

    it('advances at the slow-motion rate times speed while playing', () => {
        const p = play(INITIAL_PLAYBACK, 1000);
        expect(timeAt(p, 2000)).toBe(1000 * SIM_NS_PER_WALL_MS); // 500 000 ns after 1 s at 1x
        expect(timeAt({ ...p, speed: 4 }, 2000)).toBe(2_000_000);
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

    it('changes speed without a jump', () => {
        const playing = play(INITIAL_PLAYBACK, 0);
        const faster = setSpeed(playing, 2, 1000);
        expect(timeAt(faster, 1000)).toBe(500_000);
        expect(timeAt(faster, 2000)).toBe(1_500_000);
        expect(setSpeed(faster, 2, 3000)).toBe(faster);
        const whilePaused = setSpeed(pause(playing, 1000), 0.5, 2000);
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

    it('stops back to zero', () => {
        const stopped = stop(play(INITIAL_PLAYBACK, 0));
        expect(stopped).toMatchObject({ status: 'stopped', anchorTimeNs: 0 });
        expect(timeAt(stopped, 10_000)).toBe(0);
        expect(stop(INITIAL_PLAYBACK).speed).toBe(1);
    });

    it('formats simulation time in µs with grouping', () => {
        expect(formatSimTime(0)).toBe('t = 0.0 µs');
        expect(formatSimTime(1_234_500)).toBe('t = 1 234.5 µs');
        expect(formatSimTime(1_234_567_890)).toBe('t = 1 234 567.9 µs');
        expect(formatSimTime(-5)).toBe('t = 0.0 µs');
    });

    it('computes the period index', () => {
        expect(periodIndex(0, 1000)).toBe(0);
        expect(periodIndex(2999, 1000)).toBe(2);
        expect(periodIndex(3000, 1000)).toBe(3);
        expect(periodIndex(500, 0)).toBe(0);
    });
});
