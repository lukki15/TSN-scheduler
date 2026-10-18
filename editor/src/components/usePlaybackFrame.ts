import { useEffect } from 'react';
import { timeAt } from '../model/playback';
import { useEditorStore } from '../store/editorStore';
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
        const paint = () => {
            const elapsed = useEditorStore.getState().simulationSnapshot?.elapsed_time_ns
                ?? timeAt(usePlaybackStore.getState(), performance.now());
            draw(elapsed);
        };
        const loop = () => {
            paint();
            frame = requestAnimationFrame(loop);
        };
        const sync = () => {
            const status = usePlaybackStore.getState().status;
            cancelAnimationFrame(frame);
            if (status === 'playing') loop();
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

/** Owns the single Rust lifecycle/advance loop for the mounted editor. */
export function useSimulationPlayback(): void {
    useEffect(() => {
        let frame = 0;
        let previousStatus = usePlaybackStore.getState().status;
        const advance = () => {
            const playback = usePlaybackStore.getState();
            if (playback.status !== 'stopped') {
                const targetTimeNs = Math.floor(timeAt(playback, performance.now()));
                useEditorStore.getState().advanceSimulation(targetTimeNs);
            }
        };
        const loop = () => {
            advance();
            frame = requestAnimationFrame(loop);
        };
        const sync = () => {
            const status = usePlaybackStore.getState().status;
            if (status !== previousStatus) {
                if (status === 'playing') useEditorStore.getState().startSimulation();
                else if (status === 'paused') useEditorStore.getState().pauseSimulation();
                else useEditorStore.getState().resetSimulation();
                previousStatus = status;
            }
            cancelAnimationFrame(frame);
            if (status === 'playing') loop();
            else advance();
        };
        sync();
        const unsubscribe = usePlaybackStore.subscribe(sync);
        return () => {
            unsubscribe();
            cancelAnimationFrame(frame);
        };
    }, []);
}
