import { useEffect } from 'react';
import { timeAt } from '../model/playback';
import { usePlaybackStore } from '../store/playbackStore';

/**
 * Calls `draw(timeNs)` once per animation frame while playback is running, and
 * once per playback state change (seek, pause, stop, scale) otherwise, so
 * paused or stopped views cost nothing per frame. `draw` writes to the DOM
 * directly; wrap it in `useCallback` so a change of its inputs repaints.
 */
export function usePlaybackFrame(draw: (timeNs: number) => void): void {
    useEffect(() => {
        let frame = 0;
        const paint = () => draw(timeAt(usePlaybackStore.getState(), performance.now()));
        const loop = () => {
            paint();
            frame = requestAnimationFrame(loop);
        };
        const sync = () => {
            cancelAnimationFrame(frame);
            if (usePlaybackStore.getState().status === 'playing') loop();
            else paint();
        };
        sync();
        const unsubscribe = usePlaybackStore.subscribe(sync);
        return () => {
            unsubscribe();
            cancelAnimationFrame(frame);
        };
    }, [draw]);
}
