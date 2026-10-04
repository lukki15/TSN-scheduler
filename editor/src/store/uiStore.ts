import { create } from 'zustand';
import { browserStorage, isRecord, num, readPref, writePref, type StorageLike } from '../model/persistence';
import type { LinkId } from '../model/types';

/**
 * Transient view state: hover and dock preferences. Kept out of the editor
 * store because hover changes at pointer rate and dock sizing is a device
 * preference, not part of the document.
 */

export const DOCK_PREFS_KEY = 'tsn_editor_timeline_dock';
export const DOCK_DEFAULT_HEIGHT = 240;
export const DOCK_MIN_HEIGHT = 120;
export const DOCK_MAX_VH = 0.6;

export interface DockPrefs {
    height: number;
    collapsed: boolean;
    showIdleLinks: boolean;
}

export const DEFAULT_DOCK_PREFS: DockPrefs = { height: DOCK_DEFAULT_HEIGHT, collapsed: false, showIdleLinks: false };

export function clampDockHeight(height: number, viewportHeight: number): number {
    const max = Math.max(DOCK_MIN_HEIGHT, Math.floor(viewportHeight * DOCK_MAX_VH));
    if (!Number.isFinite(height)) return DOCK_DEFAULT_HEIGHT;
    return Math.min(max, Math.max(DOCK_MIN_HEIGHT, Math.round(height)));
}

export function readDockPrefs(storage: StorageLike | undefined, viewportHeight: number = Number.POSITIVE_INFINITY): DockPrefs {
    return readPref(
        storage,
        DOCK_PREFS_KEY,
        (raw) => {
            const p: unknown = JSON.parse(raw);
            if (!isRecord(p)) return null;
            return {
                height: clampDockHeight(num(p.height, DOCK_DEFAULT_HEIGHT), viewportHeight),
                collapsed: p.collapsed === true,
                showIdleLinks: p.showIdleLinks === true,
            };
        },
        DEFAULT_DOCK_PREFS,
    );
}

export function writeDockPrefs(storage: StorageLike | undefined, prefs: DockPrefs): void {
    writePref(storage, DOCK_PREFS_KEY, JSON.stringify(prefs));
}

export interface UiState {
    /** Link hovered in the timeline, highlighted on the canvas. */
    hoveredLinkId: LinkId | null;
    dockHeight: number;
    dockCollapsed: boolean;
    showIdleLinks: boolean;
    setHoveredLink: (id: LinkId | null) => void;
    setDockHeight: (height: number) => void;
    toggleDockCollapsed: () => void;
    toggleShowIdleLinks: () => void;
}

function viewportHeight(): number {
    return typeof window !== 'undefined' ? window.innerHeight : Number.POSITIVE_INFINITY;
}

const initial = readDockPrefs(browserStorage(), viewportHeight());

export const useUiStore = create<UiState>()((set, get) => ({
    hoveredLinkId: null,
    dockHeight: initial.height,
    dockCollapsed: initial.collapsed,
    showIdleLinks: initial.showIdleLinks,

    setHoveredLink: (id) => {
        if (get().hoveredLinkId !== id) set({ hoveredLinkId: id });
    },
    setDockHeight: (height) => set({ dockHeight: clampDockHeight(height, viewportHeight()) }),
    toggleDockCollapsed: () => set({ dockCollapsed: !get().dockCollapsed }),
    toggleShowIdleLinks: () => set({ showIdleLinks: !get().showIdleLinks }),
}));

// Dock preferences persist as a property of the store, not of each action
useUiStore.subscribe((state, previous) => {
    if (state.dockHeight !== previous.dockHeight || state.dockCollapsed !== previous.dockCollapsed || state.showIdleLinks !== previous.showIdleLinks) {
        writeDockPrefs(browserStorage(), { height: state.dockHeight, collapsed: state.dockCollapsed, showIdleLinks: state.showIdleLinks });
    }
});
