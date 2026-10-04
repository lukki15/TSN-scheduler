import { clamp } from '../../model/math';

/** Pixel layout constants shared by the timeline ruler, rows, playhead and scrubbing. */
export const LABEL_WIDTH = 160;
export const SUB_ROW_HEIGHT = 16;
export const GROUP_GAP = 6;
export const GROUP_HEIGHT = 2 * SUB_ROW_HEIGHT + GROUP_GAP;
export const RULER_HEIGHT = 24;
export const BAR_PAD = 2;
export const MIN_BAR_PX = 2;

/** Window time → x within a bars area `width` px wide. */
export function xOf(ns: number, windowNs: number, width: number): number {
    return windowNs > 0 ? (ns / windowNs) * width : 0;
}

/** Inverse of `xOf`, clamped to [0, windowNs) so a drag past the right edge never lands in the next cycle. */
export function nsAt(x: number, windowNs: number, width: number): number {
    return width > 0 ? clamp(x / width, 0, 1 - 1e-9) * windowNs : 0;
}

export function groupTop(index: number): number {
    return index * GROUP_HEIGHT + GROUP_GAP / 2;
}

export function rowsHeight(groupCount: number): number {
    return groupCount * GROUP_HEIGHT;
}
