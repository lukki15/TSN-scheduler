import { beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_DOCK_PREFS,
    DOCK_DEFAULT_HEIGHT,
    DOCK_MIN_HEIGHT,
    DOCK_PREFS_KEY,
    clampDockHeight,
    readDockPrefs,
    useUiStore,
    writeDockPrefs,
} from '../store/uiStore';
import { brokenStorage, fakeStorage } from './fakeStorage';

describe('dock prefs', () => {
    it('clamps the height between the minimum and 60 % of the viewport', () => {
        expect(clampDockHeight(50, 1000)).toBe(DOCK_MIN_HEIGHT);
        expect(clampDockHeight(300, 1000)).toBe(300);
        expect(clampDockHeight(900, 1000)).toBe(600);
        expect(clampDockHeight(Number.NaN, 1000)).toBe(DOCK_DEFAULT_HEIGHT);
        expect(clampDockHeight(300.6, Number.POSITIVE_INFINITY)).toBe(301);
    });

    it('reads defaults for missing, corrupt or out-of-range prefs', () => {
        expect(readDockPrefs(undefined)).toEqual(DEFAULT_DOCK_PREFS);
        expect(readDockPrefs(fakeStorage())).toEqual(DEFAULT_DOCK_PREFS);
        expect(readDockPrefs(fakeStorage({ [DOCK_PREFS_KEY]: '{' }))).toEqual(DEFAULT_DOCK_PREFS);
        expect(readDockPrefs(fakeStorage({ [DOCK_PREFS_KEY]: '42' }))).toEqual(DEFAULT_DOCK_PREFS);
        expect(readDockPrefs(fakeStorage({ [DOCK_PREFS_KEY]: JSON.stringify({ height: 5000, collapsed: 'yes', showIdleLinks: true }) }), 1000)).toEqual({
            height: 600,
            collapsed: false,
            showIdleLinks: true,
        });
    });

    it('round-trips through storage and swallows write failures', () => {
        const storage = fakeStorage();
        writeDockPrefs(storage, { height: 333, collapsed: true, showIdleLinks: false });
        expect(readDockPrefs(storage, 2000)).toEqual({ height: 333, collapsed: true, showIdleLinks: false });
        expect(() => writeDockPrefs(brokenStorage, DEFAULT_DOCK_PREFS)).not.toThrow();
        expect(() => writeDockPrefs(undefined, DEFAULT_DOCK_PREFS)).not.toThrow();
    });
});

describe('uiStore', () => {
    beforeEach(() => {
        useUiStore.setState({ hoveredLinkId: null, dockHeight: DOCK_DEFAULT_HEIGHT, dockCollapsed: false, showIdleLinks: false });
    });

    it('toggles dock state and clamps heights', () => {
        const s = () => useUiStore.getState();
        s().setDockHeight(10);
        expect(s().dockHeight).toBe(DOCK_MIN_HEIGHT);
        s().setDockHeight(400);
        expect(s().dockHeight).toBe(400);
        s().toggleDockCollapsed();
        expect(s().dockCollapsed).toBe(true);
        s().toggleShowIdleLinks();
        expect(s().showIdleLinks).toBe(true);
    });

    it('only updates hover when it changes', () => {
        const s = () => useUiStore.getState();
        const before = s();
        s().setHoveredLink(null);
        expect(useUiStore.getState()).toBe(before);
        s().setHoveredLink('ab');
        expect(s().hoveredLinkId).toBe('ab');
        s().setHoveredLink(null);
        expect(s().hoveredLinkId).toBeNull();
    });
});
