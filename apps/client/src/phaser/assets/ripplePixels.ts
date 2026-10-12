/**
 * Ripples: small marks on the water that grow, hold, shrink and vanish in place,
 * then turn up somewhere else. The sea is made of a scatter of them, instead of
 * long lines that slide across it. Plain functions on pixel pictures so they can
 * be tested; SeaView draws them.
 */

export type RippleGlyph = 'dash' | 'arch' | 'wide';

export const RIPPLE_GLYPHS: readonly RippleGlyph[] = ['dash', 'arch', 'wide'];

/** Frames in a ripple's life: starts small, peaks in the middle, ends small. */
export const RIPPLE_FRAMES = 5;

/** How long each frame shows, in milliseconds. */
export const RIPPLE_FRAME_MS = 280;

/** A ripple's whole life, in milliseconds. */
export const RIPPLE_LIFE_MS = RIPPLE_FRAMES * RIPPLE_FRAME_MS;

/** `#` is a light pixel, `s` a shade one, `.` nothing. Rows top to bottom, one array a frame. */
const GLYPHS: Record<RippleGlyph, string[][]> = {
  dash: [['###'], ['######'], ['#########'], ['######'], ['###']],
  arch: [
    ['#####'],
    ['..#####..', '.s.....s.'],
    ['...#######...', '.##s.....s##.', 's...........s'],
    ['..#####..', '.s.....s.'],
    ['#####'],
  ],
  wide: [
    ['#######'],
    ['..#########..', '.s.........s.'],
    ['....#########....', '..##s.......s##..', 's...............s'],
    ['..#########..', '.s.........s.'],
    ['#######'],
  ],
};

export type RipplePixel = 'light' | 'shade' | null;

/** Which way a ripple lies: along x (flat) or along y (standing up), to match the swell. */
export type RippleAxis = 'x' | 'y';

/** The width and height of the picture every frame of a glyph is drawn on. */
export function glyphSize(glyph: RippleGlyph): { readonly width: number; readonly height: number } {
  let width = 0;
  let height = 0;
  for (const frame of GLYPHS[glyph]) {
    height = Math.max(height, frame.length);
    for (const row of frame) {
      width = Math.max(width, row.length);
    }
  }
  return { width, height };
}

/**
 * One pixel of one frame of a glyph, centred on its picture. For a ripple that
 * stands up (`axis` y) the picture is turned on its side.
 */
export function ripplePixel(
  glyph: RippleGlyph,
  frame: number,
  axis: RippleAxis,
  x: number,
  y: number,
): RipplePixel {
  const { width, height } = glyphSize(glyph);
  const [px, py] = axis === 'x' ? [x, y] : [y, x];
  const rows = GLYPHS[glyph][frame];
  const left = Math.floor((width - Math.max(...rows.map((r) => r.length))) / 2);
  const top = Math.floor((height - rows.length) / 2);
  const row = rows[py - top];
  if (row === undefined) {
    return null;
  }
  const char = row[px - left];
  return char === '#' ? 'light' : char === 's' ? 'shade' : null;
}

/** The size of the picture for a glyph at an axis. */
export function pictureSize(
  glyph: RippleGlyph,
  axis: RippleAxis,
): { readonly width: number; readonly height: number } {
  const { width, height } = glyphSize(glyph);
  return axis === 'x' ? { width, height } : { width: height, height: width };
}

/** Which frame a ripple is on `ageMs` into its life, or -1 when it is over (or not begun). */
export function rippleFrameAt(ageMs: number): number {
  if (ageMs < 0 || ageMs >= RIPPLE_LIFE_MS) {
    return -1;
  }
  return Math.floor(ageMs / RIPPLE_FRAME_MS);
}

/** A glyph chosen by chance: mostly small dashes, some arches, a few wide ones. */
export function chooseGlyph(roll: number): RippleGlyph {
  if (roll < 0.5) return 'dash';
  if (roll < 0.85) return 'arch';
  return 'wide';
}

/** How many pixels of a frame are marked. */
export function framePixels(glyph: RippleGlyph, frame: number): number {
  return GLYPHS[glyph][frame].reduce(
    (total, row) => total + [...row].filter((c) => c !== '.').length,
    0,
  );
}
