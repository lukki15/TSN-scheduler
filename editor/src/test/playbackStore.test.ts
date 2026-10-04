import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PLAYBACK, timeAt } from '../model/playback';
import { usePlaybackStore } from '../store/playbackStore';

const store = () => usePlaybackStore.getState();

describe('playbackStore scrubbing', () => {
    let now = 0;
    beforeEach(() => {
        now = 10_000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        usePlaybackStore.setState({ ...INITIAL_PLAYBACK, scrubbing: false, resumeAfterScrub: false });
    });
    afterEach(() => vi.restoreAllMocks());

    it('pauses while scrubbing and resumes afterwards when it was playing', () => {
        store().play();
        now += 1000;
        store().beginScrub();
        expect(store()).toMatchObject({ status: 'paused', scrubbing: true, resumeAfterScrub: true });
        expect(timeAt(store(), now)).toBe(500_000);

        store().seek(2_000_000);
        now += 5000;
        expect(timeAt(store(), now)).toBe(2_000_000); // frozen while scrubbing

        store().endScrub();
        expect(store()).toMatchObject({ status: 'playing', scrubbing: false, resumeAfterScrub: false });
        now += 1000;
        expect(timeAt(store(), now)).toBe(2_500_000);
    });

    it('stays paused after a scrub that started paused or stopped', () => {
        store().beginScrub();
        expect(store()).toMatchObject({ status: 'stopped', scrubbing: true, resumeAfterScrub: false });
        store().seek(42);
        store().endScrub();
        expect(store()).toMatchObject({ status: 'paused', scrubbing: false, anchorTimeNs: 42 });

        store().play();
        store().pause();
        store().beginScrub();
        store().endScrub();
        expect(store().status).toBe('paused');
    });

    it('ignores endScrub without beginScrub and double beginScrub', () => {
        store().play();
        store().endScrub();
        expect(store().status).toBe('playing');
        store().beginScrub();
        store().beginScrub();
        expect(store().resumeAfterScrub).toBe(true);
        store().endScrub();
        expect(store().status).toBe('playing');
    });

    it('stop clears scrub state and seek while stopped shows a paused clock', () => {
        store().play();
        store().beginScrub();
        store().stop();
        expect(store()).toMatchObject({ status: 'stopped', anchorTimeNs: 0, scrubbing: false, resumeAfterScrub: false });
        store().seek(777);
        expect(store()).toMatchObject({ status: 'paused', anchorTimeNs: 777 });
    });
});
