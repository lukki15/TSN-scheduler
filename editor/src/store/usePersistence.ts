import { useEffect, useRef } from 'react';
import { serialize, writeSnapshot, type StorageLike } from '../model/persistence';
import { snapshotOf, useEditorStore } from './editorStore';

const SAVE_DELAY_MS = 500;

function browserStorage(): StorageLike | undefined {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Debounced autosave of the editor state. Mirrors ArchAlive's persistence
 * effect: wait 500 ms after the last change, serialize, skip the write when
 * nothing changed since the last save. A pending save is flushed when the page
 * is hidden (tab close, reload, navigation) and when the hook unmounts, so the
 * last edits are never lost to the debounce.
 */
export function usePersistence(storage: StorageLike | undefined = browserStorage()) {
    const lastSavedRef = useRef<string>('');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!storage) return;

        const flush = () => {
            saveTimerRef.current = null;
            const json = serialize(snapshotOf(useEditorStore.getState()));
            if (json === lastSavedRef.current) return;
            if (writeSnapshot(storage, json)) lastSavedRef.current = json;
        };

        const schedule = () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(flush, SAVE_DELAY_MS);
        };

        const flushPending = () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                flush();
            }
        };
        window.addEventListener('pagehide', flushPending);

        const unsubscribe = useEditorStore.subscribe((state, previous) => {
            if (
                state.nodes !== previous.nodes ||
                state.edges !== previous.edges ||
                state.streams !== previous.streams ||
                state.viewport !== previous.viewport
            ) {
                schedule();
            }
        });

        return () => {
            unsubscribe();
            window.removeEventListener('pagehide', flushPending);
            flushPending();
        };
    }, [storage]);
}
