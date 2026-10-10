import { describe, expect, it } from 'vitest';
import { DEFAULT_LINK } from '../model/defaults';
import { propagationNs, streamOffsetNs, transmissionNs } from '../model/schedule';

describe('timing helpers', () => {
    it('computes transmission time from size and bandwidth', () => {
        expect(transmissionNs(128, 1000)).toBe(1024); // 1024 bit at 1 Gbit/s
        expect(transmissionNs(1500, 100)).toBe(120_000);
        expect(transmissionNs(0, 1000)).toBe(0);
        expect(transmissionNs(-5, 1000)).toBe(0);
    });
    it('falls back to the default bandwidth when invalid', () => {
        expect(transmissionNs(128, 0)).toBe(transmissionNs(128, DEFAULT_LINK.bandwidth));
        expect(transmissionNs(128, Number.NaN)).toBe(transmissionNs(128, DEFAULT_LINK.bandwidth));
    });
    it('computes propagation from length', () => {
        expect(propagationNs(10)).toBe(50);
        expect(propagationNs(-1)).toBe(0);
        expect(propagationNs(Number.NaN)).toBe(0);
    });
    it('spreads offsets across the period', () => {
        expect([0, 1, 2].map((i) => streamOffsetNs(i, 3, 300))).toEqual([0, 100, 200]);
        expect(streamOffsetNs(0, 0, 300)).toBe(0);
    });
});

