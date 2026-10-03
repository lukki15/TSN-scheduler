import { create } from 'zustand';
import {
    INITIAL_PLAYBACK,
    pause,
    play,
    setSpeed,
    stop,
    type Playback,
    type Speed,
} from '../model/playback';

export interface PlaybackActions {
    play: () => void;
    pause: () => void;
    toggle: () => void;
    stop: () => void;
    setSpeed: (speed: Speed) => void;
}

/** Transport state. Not persisted: every reload starts stopped at t = 0. */
export const usePlaybackStore = create<Playback & PlaybackActions>()((set, get) => ({
    ...INITIAL_PLAYBACK,
    play: () => set(play(get(), performance.now())),
    pause: () => set(pause(get(), performance.now())),
    toggle: () => {
        const now = performance.now();
        set(get().status === 'playing' ? pause(get(), now) : play(get(), now));
    },
    stop: () => set(stop(get())),
    setSpeed: (speed) => set(setSpeed(get(), speed, performance.now())),
}));
