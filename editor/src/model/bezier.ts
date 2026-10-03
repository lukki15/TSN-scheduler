/**
 * Edge geometry mirroring React Flow (`@xyflow/system`) so packets ride exactly
 * on the drawn bezier. Structural types only: no React or library imports, so
 * this stays unit-testable in node.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left'; // identical to React Flow's Position values

export interface AnchorHandle {
    id?: string | null;
    /** Position relative to the node's top-left corner. */
    x: number;
    y: number;
    width: number;
    height: number;
    position: Side;
}

export interface AnchorNode {
    positionAbsolute: { x: number; y: number };
    width: number;
    height: number;
    handles: readonly AnchorHandle[];
}

export interface Point {
    x: number;
    y: number;
}

/** React Flow's `getHandle`: explicit id, otherwise the first handle; null when there is none. */
export function pickHandle(handles: readonly AnchorHandle[], id: string | null | undefined): AnchorHandle | null {
    if (handles.length === 0) return null;
    return (id ? handles.find((h) => h.id === id) : handles[0]) ?? null;
}

/**
 * Port of React Flow's `getHandlePosition`: the edge meets the handle at the
 * outer middle of the handle box, not its center. Without a handle the node
 * box itself is used with `fallbackSide`.
 */
export function handleAnchor(node: AnchorNode, handle: AnchorHandle | null, fallbackSide: Side): Point {
    const x = (handle?.x ?? 0) + node.positionAbsolute.x;
    const y = (handle?.y ?? 0) + node.positionAbsolute.y;
    const width = handle?.width ?? node.width;
    const height = handle?.height ?? node.height;
    switch (handle?.position ?? fallbackSide) {
        case 'top':
            return { x: x + width / 2, y };
        case 'right':
            return { x: x + width, y: y + height / 2 };
        case 'bottom':
            return { x: x + width / 2, y: y + height };
        case 'left':
            return { x, y: y + height / 2 };
    }
}

export const DEFAULT_CURVATURE = 0.25;

function controlOffset(distance: number, curvature: number): number {
    return distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance);
}

/** Port of `getControlWithCurvature`: the control point for the end at (x1, y1) leaving towards `side`. */
export function controlPoint(side: Side, x1: number, y1: number, x2: number, y2: number, curvature = DEFAULT_CURVATURE): Point {
    switch (side) {
        case 'left':
            return { x: x1 - controlOffset(x1 - x2, curvature), y: y1 };
        case 'right':
            return { x: x1 + controlOffset(x2 - x1, curvature), y: y1 };
        case 'top':
            return { x: x1, y: y1 - controlOffset(y1 - y2, curvature) };
        case 'bottom':
            return { x: x1, y: y1 + controlOffset(y2 - y1, curvature) };
    }
}

export interface Cubic {
    s: Point;
    c1: Point;
    c2: Point;
    t: Point;
}

export interface EdgeEnd extends Point {
    side: Side;
}

/** The cubic React Flow draws for an edge between these two ends (`getBezierPath`). */
export function edgeCubic(source: EdgeEnd, target: EdgeEnd, curvature = DEFAULT_CURVATURE): Cubic {
    return {
        s: { x: source.x, y: source.y },
        c1: controlPoint(source.side, source.x, source.y, target.x, target.y, curvature),
        c2: controlPoint(target.side, target.x, target.y, source.x, source.y, curvature),
        t: { x: target.x, y: target.y },
    };
}

export function cubicAt(c: Cubic, u: number): Point {
    const v = 1 - u;
    const a = v * v * v;
    const b = 3 * v * v * u;
    const d = 3 * v * u * u;
    const e = u * u * u;
    return {
        x: a * c.s.x + b * c.c1.x + d * c.c2.x + e * c.t.x,
        y: a * c.s.y + b * c.c1.y + d * c.c2.y + e * c.t.y,
    };
}

/** Unit normal (left of the travel direction s → t) at parameter `u`; `(0, -1)` when the tangent degenerates. */
export function cubicNormalAt(c: Cubic, u: number): Point {
    const v = 1 - u;
    const dx = 3 * v * v * (c.c1.x - c.s.x) + 6 * v * u * (c.c2.x - c.c1.x) + 3 * u * u * (c.t.x - c.c2.x);
    const dy = 3 * v * v * (c.c1.y - c.s.y) + 6 * v * u * (c.c2.y - c.c1.y) + 3 * u * u * (c.t.y - c.c2.y);
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: 0, y: -1 };
    return { x: -dy / len, y: dx / len };
}

/**
 * Full edge geometry from two nodes and their handle ids, with React Flow's
 * fallbacks (first handle when the id is unknown; node box with bottom/top
 * sides when a node has no measured handles).
 */
export function edgeGeometry(
    source: AnchorNode,
    sourceHandleId: string | null | undefined,
    target: AnchorNode,
    targetHandleId: string | null | undefined,
): Cubic {
    const sh = pickHandle(source.handles, sourceHandleId);
    const th = pickHandle(target.handles, targetHandleId);
    const sSide: Side = sh?.position ?? 'bottom';
    const tSide: Side = th?.position ?? 'top';
    const s = handleAnchor(source, sh, sSide);
    const t = handleAnchor(target, th, tSide);
    return edgeCubic({ ...s, side: sSide }, { ...t, side: tSide });
}
