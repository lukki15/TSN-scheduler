import { describe, expect, it } from 'vitest';
import { Position, getBezierPath } from '@xyflow/system';
import {
    controlPoint,
    cubicAt,
    cubicNormalAt,
    edgeCubic,
    edgeGeometry,
    handleAnchor,
    pickHandle,
    type AnchorHandle,
    type AnchorNode,
    type Side,
} from '../model/bezier';

const handle = (id: string, position: Side, x: number, y: number): AnchorHandle => ({ id, position, x, y, width: 12, height: 12 });

// A 280×60 node at (100, 100) with ArchAlive-style handles (6 px outside the border)
const node: AnchorNode = {
    positionAbsolute: { x: 100, y: 100 },
    width: 280,
    height: 60,
    handles: [handle('top', 'top', 134, -6), handle('right', 'right', 274, 24), handle('bottom', 'bottom', 134, 54), handle('left', 'left', -6, 24)],
};

/** Parses React Flow's `M sx,sy Csx,cy c2x,c2y tx,ty` path string. */
function parsePath(path: string) {
    const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    return { s: { x: nums[0], y: nums[1] }, c1: { x: nums[2], y: nums[3] }, c2: { x: nums[4], y: nums[5] }, t: { x: nums[6], y: nums[7] } };
}

describe('handle anchors', () => {
    it('picks handles like React Flow', () => {
        expect(pickHandle(node.handles, 'left')?.id).toBe('left');
        expect(pickHandle(node.handles, undefined)?.id).toBe('top');
        expect(pickHandle(node.handles, 'nope')).toBeNull();
        expect(pickHandle([], 'top')).toBeNull();
    });

    it('anchors at the outer middle of the handle box', () => {
        expect(handleAnchor(node, node.handles[0], 'top')).toEqual({ x: 240, y: 94 });
        expect(handleAnchor(node, node.handles[1], 'top')).toEqual({ x: 386, y: 130 });
        expect(handleAnchor(node, node.handles[2], 'top')).toEqual({ x: 240, y: 166 });
        expect(handleAnchor(node, node.handles[3], 'top')).toEqual({ x: 94, y: 130 });
    });

    it('falls back to the node box', () => {
        expect(handleAnchor(node, null, 'bottom')).toEqual({ x: 240, y: 160 });
        expect(handleAnchor(node, null, 'top')).toEqual({ x: 240, y: 100 });
    });
});

describe('bezier', () => {
    it('matches React Flow control offsets', () => {
        expect(controlPoint('right', 0, 0, 100, 0)).toEqual({ x: 50, y: 0 });
        expect(controlPoint('right', 0, 0, -100, 0)).toEqual({ x: 0.25 * 25 * 10, y: 0 });
        expect(controlPoint('top', 0, 0, 0, -40)).toEqual({ x: 0, y: -20 });
        expect(controlPoint('bottom', 0, 0, 0, -40)).toEqual({ x: 0, y: 0.25 * 25 * Math.sqrt(40) });
    });

    it('reproduces getBezierPath for every side combination and direction', () => {
        const sides: Side[] = ['top', 'right', 'bottom', 'left'];
        const ends = [
            [{ x: 0, y: 0 }, { x: 300, y: 120 }],
            [{ x: 300, y: 120 }, { x: 0, y: 0 }],
            [{ x: 50, y: 400 }, { x: 60, y: 10 }],
        ];
        for (const [s, t] of ends) {
            for (const ss of sides) {
                for (const ts of sides) {
                    const expected = parsePath(
                        getBezierPath({ sourceX: s.x, sourceY: s.y, sourcePosition: ss as Position, targetX: t.x, targetY: t.y, targetPosition: ts as Position })[0],
                    );
                    const actual = edgeCubic({ ...s, side: ss }, { ...t, side: ts });
                    expect(actual.c1.x).toBeCloseTo(expected.c1.x, 6);
                    expect(actual.c1.y).toBeCloseTo(expected.c1.y, 6);
                    expect(actual.c2.x).toBeCloseTo(expected.c2.x, 6);
                    expect(actual.c2.y).toBeCloseTo(expected.c2.y, 6);
                }
            }
        }
    });

    it('interpolates endpoints and midpoints', () => {
        const c = edgeCubic({ x: 0, y: 0, side: 'right' }, { x: 100, y: 0, side: 'left' });
        expect(cubicAt(c, 0)).toEqual({ x: 0, y: 0 });
        expect(cubicAt(c, 1)).toEqual({ x: 100, y: 0 });
        expect(cubicAt(c, 0.5)).toEqual({ x: 50, y: 0 });
    });

    it('returns a unit normal perpendicular to travel', () => {
        const c = edgeCubic({ x: 0, y: 0, side: 'right' }, { x: 100, y: 0, side: 'left' });
        expect(cubicNormalAt(c, 0.5)).toEqual({ x: -0, y: 1 });
        const diagonal = edgeCubic({ x: 0, y: 0, side: 'bottom' }, { x: 100, y: 100, side: 'top' });
        const n = cubicNormalAt(diagonal, 0.5);
        expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
        const degenerate = { s: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 }, t: { x: 0, y: 0 } };
        expect(cubicNormalAt(degenerate, 0.3)).toEqual({ x: 0, y: -1 });
    });

    it('builds edge geometry from nodes with React Flow fallbacks', () => {
        const other: AnchorNode = { ...node, positionAbsolute: { x: 600, y: 100 } };
        const c = edgeGeometry(node, 'right', other, 'left');
        expect(c.s).toEqual({ x: 386, y: 130 });
        expect(c.t).toEqual({ x: 594, y: 130 });
        expect(c.c1).toEqual({ x: 490, y: 130 });

        const bare: AnchorNode = { ...other, handles: [] };
        const fallback = edgeGeometry(node, undefined, bare, undefined);
        expect(fallback.s).toEqual({ x: 240, y: 94 }); // first handle = top
        expect(fallback.t).toEqual({ x: 740, y: 100 }); // node box, top side
    });
});
