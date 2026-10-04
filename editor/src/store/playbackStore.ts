import { create } from 'zustand';
import { browserStorage, readPref, writePref, type StorageLike } from '../model/persistence';
import {
    DEFAULT_SCALE_NS_PER_S,
    INITIAL_PLAYBACK,
    nearestScale,
    pause,
    play,
    seek,
    setScale,
    stop,
    type Playback,
} from '../model/playback';

export const SCALE_PREF_KEY = 'tsn_editor_playback_scale';

/** Remembered time scale, snapped to a dial step; the default when missing or invalid. */
export function readScalePref(storage: StorageLike | undefined): number {
    return readPref(
        storage,
        SCALE_PREF_KEY,
        (raw) => {
            const value = Number(raw);
            return Number.isFinite(value) && value > 0 ? nearestScale(value) : null;
        },
        DEFAULT_SCALE_NS_PER_S,
    );
}

export function writeScalePref(storage: StorageLike | undefined, scaleNsPerS: number): void {
    writePref(storage, SCALE_PREF_KEY, String(scaleNsPerS));
}

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
    setScale: (scaleNsPerS: number) => void;
    seek: (timeNs: number) => void;
    beginScrub: () => void;
    endScrub: () => void;
}

const INITIAL_SCRUB: ScrubState = { scrubbing: false, resumeAfterScrub: false };

/** Transport state. Only the time scale is persisted; every reload starts stopped at t = 0. */
export const usePlaybackStore = create<Playback & ScrubState & PlaybackActions>()((set, get) => ({
    ...INITIAL_PLAYBACK,
    scaleNsPerS: readScalePref(browserStorage()),
    ...INITIAL_SCRUB,
    play: () => set(play(get(), performance.now())),
    pause: () => set(pause(get(), performance.now())),
    toggle: () => {
        const now = performance.now();
        set(get().status === 'playing' ? pause(get(), now) : play(get(), now));
    },
    stop: () => set({ ...stop(get()), ...INITIAL_SCRUB }),
    setScale: (scaleNsPerS) => {
        set(setScale(get(), scaleNsPerS, performance.now()));
        writeScalePref(browserStorage(), get().scaleNsPerS);
    },
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
