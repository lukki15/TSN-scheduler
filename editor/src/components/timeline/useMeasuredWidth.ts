import { useEffect, useState } from 'react';

/** Content width of `element` in px, kept current with a ResizeObserver (0 until measured or while null). */
export function useElementWidth(element: HTMLElement | null): number {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setWidth(Math.floor(entry.contentRect.width));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return element ? width : 0;
}
