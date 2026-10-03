import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragHandlers {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface PointerDragOptions<T> {
    /** Called on a primary-button press; return `false` to ignore it. */
    onStart: (e: ReactPointerEvent<HTMLElement>, context: T) => boolean | void;
    onMove: (e: ReactPointerEvent<HTMLElement>, context: T) => void;
    /** Called once when the drag ends, whether by release, cancel or lost capture. */
    onEnd?: (context: T) => void;
    /** Body cursor while dragging; the body also loses text selection. */
    cursor?: string | ((context: T) => string | undefined);
}

function lockBody(cursor: string | undefined) {
    if (cursor) document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
}

function unlockBody() {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

/**
 * Pointer-capture drag shared by every draggable surface (inspector resize,
 * dock resize, timeline scrubbing). Returns a factory: call it with a context
 * (which handle, for instance) and spread the result onto the element. The
 * body cursor and text selection are locked for the drag and always restored,
 * including when pointer capture is lost or the component unmounts.
 */
export function usePointerDrag<T = undefined>(options: PointerDragOptions<T>): (context: T) => DragHandlers {
    const active = useRef<{ context: T } | null>(null);

    useEffect(
        () => () => {
            if (active.current) {
                active.current = null;
                unlockBody();
            }
        },
        [],
    );

    return (context: T) => {
        const end = () => {
            const current = active.current;
            if (!current) return;
            active.current = null;
            unlockBody();
            options.onEnd?.(current.context);
        };
        return {
            onPointerDown: (e) => {
                if (e.button !== 0 || active.current) return;
                if (options.onStart(e, context) === false) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                active.current = { context };
                lockBody(typeof options.cursor === 'function' ? options.cursor(context) : options.cursor);
            },
            onPointerMove: (e) => {
                if (active.current && e.currentTarget.hasPointerCapture(e.pointerId)) options.onMove(e, active.current.context);
            },
            onPointerUp: end,
            onPointerCancel: end,
            onLostPointerCapture: end,
        };
    };
}
