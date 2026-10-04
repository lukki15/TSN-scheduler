import { create } from 'zustand';
import {
    INITIAL_PLAYBACK,
    pause,
    play,
    seek,
    setSpeed,
    stop,
    type Playback,
    type Speed,
} from '../model/playback';

export interface ScrubState {
    /** A drag on the timeline is in progress. */
    scrubbing: boolean;
    /** Playback was running when the scrub started; `endScrub` resumes it. */
    resumeAfterScrub: boolean;
}

export interface PlaybackActions {
    play: () => void;
    pause: () => void;
    toggle: () => void;
    stop: () => void;
    setSpeed: (speed: Speed) => void;
    seek: (timeNs: number) => void;
    beginScrub: () => void;
    endScrub: () => void;
}

const INITIAL_SCRUB: ScrubState = { scrubbing: false, resumeAfterScrub: false };

/** Transport state. Not persisted: every reload starts stopped at t = 0. */
export const usePlaybackStore = create<Playback & ScrubState & PlaybackActions>()((set, get) => ({
    ...INITIAL_PLAYBACK,
    ...INITIAL_SCRUB,
    play: () => set(play(get(), performance.now())),
    pause: () => set(pause(get(), performance.now())),
    toggle: () => {
        const now = performance.now();
        set(get().status === 'playing' ? pause(get(), now) : play(get(), now));
    },
    stop: () => set({ ...stop(get()), ...INITIAL_SCRUB }),
    setSpeed: (speed) => set(setSpeed(get(), speed, performance.now())),
    seek: (timeNs) => set(seek(get(), timeNs, performance.now())),
    beginScrub: () => {
        const state = get();
        if (state.scrubbing) return;
        set({ ...pause(state, performance.now()), scrubbing: true, resumeAfterScrub: state.status === 'playing' });
    },
    endScrub: () => {
        const state = get();
        if (!state.scrubbing) return;
        const resumed = state.resumeAfterScrub ? play(state, performance.now()) : state;
        set({ ...resumed, ...INITIAL_SCRUB });
    },
}));
