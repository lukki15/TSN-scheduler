import { useRef } from 'react';
import { periodIndex, timeAt } from '../../model/playback';
import { usePlaybackStore } from '../../store/playbackStore';
import { usePointerDrag, type DragHandlers } from '../usePointerDrag';
import { nsAt } from './geometry';

export type ScrubHandlers = DragHandlers;

/**
 * Pointer handlers that turn a drag (or click) over the bars area into seeks.
 * The cycle index is frozen at pointer-down so dragging past either edge never
 * jumps to the next or previous cycle. Playback pauses during the drag and
 * resumes on release when it was running (see playbackStore.beginScrub).
 */
export function useScrub(area: HTMLElement | null, windowNs: number): ScrubHandlers {
    const cycleRef = useRef(0);

    const seekTo = (clientX: number) => {
        if (!area) return;
        const rect = area.getBoundingClientRect();
        if (rect.width <= 0) return;
        usePlaybackStore.getState().seek(cycleRef.current * windowNs + nsAt(clientX - rect.left, windowNs, rect.width));
    };

    const drag = usePointerDrag<null>({
        onStart: (e) => {
            if (!area) return false;
            const store = usePlaybackStore.getState();
            cycleRef.current = periodIndex(timeAt(store, performance.now()), windowNs);
            store.beginScrub();
            seekTo(e.clientX);
        },
        onMove: (e) => seekTo(e.clientX),
        onEnd: () => usePlaybackStore.getState().endScrub(),
    });

    return drag(null);
}
