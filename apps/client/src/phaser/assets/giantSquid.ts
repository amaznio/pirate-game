/**
 * Where a giant squid's whip starts, in its own 96 x 64 frame. The frame is laid
 * over the right-hand side of the squid's bow cell, so this point sits on the base
 * of its arms; the whip is drawn pivoting on it, and turned or mirrored from there.
 * (The rest of its sheet is described in `monsterArt.ts`.)
 */
export const WHIP_ROOT = { x: 14, y: 18 } as const;
export const WHIP_FRAME = { width: 96, height: 64 } as const;
