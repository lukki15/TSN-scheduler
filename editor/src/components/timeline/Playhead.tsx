import { useCallback, useRef } from 'react';
import { usePlaybackFrame } from '../usePlaybackFrame';
import { LABEL_WIDTH, xOf } from './geometry';
import type { ScrubHandlers } from './useScrub';

interface PlayheadProps {
    windowNs: number;
    /** Width of the bars area in px (0 until measured). */
    width: number;
    scrub: ScrubHandlers;
}

/**
 * Vertical line marking the current simulation time within the window. Moved
 * from the playback frame loop via a ref, so playback never re-renders React.
 * The handle in the ruler zone can be dragged to scrub.
 */
export function Playhead({ windowNs, width, scrub }: PlayheadProps) {
    const lineRef = useRef<HTMLDivElement>(null);
    const lastTransform = useRef('');

    usePlaybackFrame(
        useCallback(
            (timeNs: number) => {
                const el = lineRef.current;
                if (!el || windowNs <= 0) return;
                const transform = `translateX(${xOf(timeNs % windowNs, windowNs, width)}px)`;
                if (transform === lastTransform.current) return;
                lastTransform.current = transform;
                el.style.transform = transform;
            },
            [windowNs, width],
        ),
    );

    return (
        <div
            ref={lineRef}
            className="absolute top-0 bottom-0 w-0 pointer-events-none z-20 will-change-transform"
            style={{ left: LABEL_WIDTH }}
        >
            <div className="absolute top-0 bottom-0 -left-px border-l border-indigo-500 shadow-[0_0_6px_rgba(79,70,229,0.5)]" />
            <div
                {...scrub}
                className="absolute top-0 -left-1.5 w-3 h-3.5 rounded-b bg-indigo-500 cursor-ew-resize touch-none pointer-events-auto shadow-sm hover:bg-indigo-600"
                title="Drag to scrub"
            />
        </div>
    );
}
