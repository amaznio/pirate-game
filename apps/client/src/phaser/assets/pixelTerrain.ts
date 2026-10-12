import type { Direction } from '@pirate/game-core/domain/Direction';

/**
 * Wind and whirlpools in the pixel-art style: drawn one art pixel at a time at
 * the same density as the Scallywag art (a cell is 16 art pixels, shown 4x), and
 * animated by swapping frames rather than rotating (rotating pixel art smears
 * it). The pixel rules are plain functions so they can be tested; BootScene
 * paints them onto canvases.
 */

/** A pixel's colour as CSS, or null where the picture is see-through. */
export type Pixel = string | null;

export const PIXEL_SCALE = 4;

// --- Whirlpool: a 2x2-cell vortex, 32x32 art pixels --------------------------------

export const PIXEL_WHIRLPOOL_SIZE = 32;
/** The arms line up again after this many frames. */
export const WHIRLPOOL_FRAMES = 8;
const ARMS = 3;
/** How far an arm curls between the centre and the rim, in radians. */
const CURL = 2.3;

const WHIRLPOOL_COLOURS = {
  core: '#04141d',
  deep: '#1c4f6e',
  mid: '#2f6f95',
  rim: '#8cc4e0',
  foam: '#eaf6ff',
} as const;

/** One pixel of a whirlpool frame. Clockwise or counter-clockwise, `frame` of 8. */
export function whirlpoolPixel(
  x: number,
  y: number,
  frame: number,
  clockwise: boolean,
): Pixel {
  const centre = PIXEL_WHIRLPOOL_SIZE / 2;
  const radius = centre - 0.5;
  const dx = x + 0.5 - centre;
  const dy = y + 0.5 - centre;
  const r = Math.hypot(dx, dy);
  if (r > radius) {
    return null;
  }
  if (r < 2.6) {
    return WHIRLPOOL_COLOURS.core;
  }
  if (r > radius - 1.1) {
    return WHIRLPOOL_COLOURS.rim;
  }

  // Arms trail behind the way the vortex turns and move that way frame by frame.
  const turn = clockwise ? 1 : -1;
  const spin = turn * (frame / WHIRLPOOL_FRAMES) * ((Math.PI * 2) / ARMS);
  const curl = -turn * (r / radius) * CURL;
  const along = ((Math.atan2(dy, dx) - curl - spin) * ARMS) / (Math.PI * 2);
  const phase = along - Math.floor(along);
  const width = 0.34 - 0.16 * (r / radius);
  if (phase < width) {
    return WHIRLPOOL_COLOURS.foam;
  }
  return r < 7 ? WHIRLPOOL_COLOURS.deep : WHIRLPOOL_COLOURS.mid;
}

// --- Wind: chevrons in one 16x16 cell ----------------------------------------------

export const WIND_SIZE = 16;
const WIND_COLOURS = { foam: '#eaf6ff' } as const;

/** Two chevrons pointing east, as the pixels they cover. */
function eastChevrons(): Set<string> {
  const covered = new Set<string>();
  for (const tip of [6, 12]) {
    for (let step = -4; step <= 4; step += 1) {
      const x = tip - Math.abs(step);
      covered.add(`${x},${7 + step}`);
      covered.add(`${x - 1},${7 + step}`);
    }
  }
  return covered;
}

const EAST_CHEVRONS = eastChevrons();

/** Turns a pixel position of the finished picture back to where it sits in the east-facing one. */
function toEast(x: number, y: number, direction: Direction): [number, number] {
  const last = WIND_SIZE - 1;
  switch (direction) {
    case 'EAST':
      return [x, y];
    case 'WEST':
      return [last - x, last - y];
    case 'SOUTH':
      return [y, last - x];
    case 'NORTH':
      return [last - y, x];
  }
}

/** One pixel of the wind chevrons pointing the given way. */
export function windPixel(x: number, y: number, direction: Direction): Pixel {
  const [ex, ey] = toEast(x, y, direction);
  return EAST_CHEVRONS.has(`${ex},${ey}`) ? WIND_COLOURS.foam : null;
}

// --- Cannonball: 4x4 art pixels ------------------------------------------------------

export const BALL_SIZE = 4;
export const PIXEL_BALL_KEY = 'pixel-ball';

/** A dark iron ball with one highlight pixel. */
export function ballPixel(x: number, y: number): Pixel {
  const corner = (x === 0 || x === BALL_SIZE - 1) && (y === 0 || y === BALL_SIZE - 1);
  if (corner) {
    return null;
  }
  return x === 1 && y === 1 ? '#6b6f86' : '#1b1b2b';
}

// --- Texture keys ---------------------------------------------------------------------

export const pixelWindKey = (direction: Direction): string => `pixel-wind-${direction}`;
export const pixelWhirlpoolKey = (clockwise: boolean, frame: number): string =>
  `pixel-whirlpool-${clockwise ? 'right' : 'left'}-${frame}`;
