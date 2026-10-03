/**
 * Stream colors. Each stream owns a hue (0..359); saturation and lightness are
 * fixed so every stream reads at the same weight on the light canvas. Tailwind
 * cannot generate classes for runtime colors, so consumers use inline styles.
 */
export const HUE_SATURATION = 70;
export const HUE_LIGHTNESS = 48;

export function randomHue(random: () => number = Math.random): number {
    return Math.floor(random() * 360) % 360;
}

/** Deterministic hue for streams saved before colors existed (FNV-1a over the id). */
export function hueFromId(id: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % 360;
}

export function hueToCss(hue: number, alpha = 1): string {
    return alpha >= 1
        ? `hsl(${hue} ${HUE_SATURATION}% ${HUE_LIGHTNESS}%)`
        : `hsl(${hue} ${HUE_SATURATION}% ${HUE_LIGHTNESS}% / ${alpha})`;
}
