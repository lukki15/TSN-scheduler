import type { StorageLike } from '../model/persistence';

/** In-memory `StorageLike` exposing its backing map for assertions. */
export function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** Storage whose writes fail, like a full or blocked `localStorage`. */
export const brokenStorage: StorageLike = {
    getItem: () => null,
    setItem: () => {
        throw new Error('quota');
    },
};
