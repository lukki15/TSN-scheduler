import { describe, expect, it } from 'vitest';
import { hueFromId, hueToCss, randomHue } from '../model/colors';

describe('colors', () => {
    it('randomHue maps the random source onto 0..359', () => {
        expect(randomHue(() => 0)).toBe(0);
        expect(randomHue(() => 0.5)).toBe(180);
        expect(randomHue(() => 0.999999)).toBe(359);
    });

    it('hueFromId is deterministic, in range and spreads ids', () => {
        expect(hueFromId('abc')).toBe(hueFromId('abc'));
        for (const id of ['a', 'b', 'stream-1', 'f47ac10b-58cc-4372-a567-0e02b2c3d479']) {
            const h = hueFromId(id);
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(360);
            expect(Number.isInteger(h)).toBe(true);
        }
        expect(hueFromId('a')).not.toBe(hueFromId('b'));
    });

    it('formats css colors with optional alpha', () => {
        expect(hueToCss(200)).toBe('hsl(200 70% 48%)');
        expect(hueToCss(200, 0.15)).toBe('hsl(200 70% 48% / 0.15)');
    });
});
