import { useEffect, useState } from 'react';

export interface MeasuredElement<T extends HTMLElement> {
    /** Attach as `ref` to the element to measure; works for elements that mount later. */
    ref: (el: T | null) => void;
    element: T | null;
    /** Content width in px, 0 until measured. */
    width: number;
}

/** Tracks an element and its content width with a ResizeObserver. */
export function useMeasuredWidth<T extends HTMLElement = HTMLDivElement>(): MeasuredElement<T> {
    const [element, setElement] = useState<T | null>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setWidth(Math.floor(entry.contentRect.width));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return { ref: setElement, element, width };
}
