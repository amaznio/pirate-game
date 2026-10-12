import type { SeaChoice } from '@pirate/game-core/board/generateBoard';
import { CALM_SEA, type SeaPalette } from './seaPixels';

/**
 * How lively the sea is drawn: the colours of the water, how many ripples and
 * white-caps there are and how soon they come again, and how fast the surf
 * washes on the rocks. It follows the "Seas" choice of the match, so a stormy
 * board looks stormy and a calm one calm. Everything here is looks only.
 */
export interface SeaLook {
  readonly palette: SeaPalette;
  /** How many ripples there can be at once. */
  readonly ripples: number;
  /** Scales the wait between a ripple's lives: below 1 is busier. */
  readonly rippleWait: number;
  /** Flecks of white on the crests (none in calm water). */
  readonly whitecaps: number;
  /** Seconds for one wash of foam on a rock, and how fast the wave runs (pixels a second). */
  readonly surfPeriod: number;
  readonly surfSpeed: number;
  /** Specks of spray thrown up when a wave breaks on a rock (0 for none: off for now, it looked busy). */
  readonly spray: number;
}

/** Lighter and greener than the normal sea, with fewer marks. */
const GENTLE_SEA: SeaPalette = {
  ...CALM_SEA,
  depth: ['#8accea', '#79bfe2', '#68b1d8'],
  depthMap: ['#a6dbef', '#8dcee8', '#7bc1e1', '#6ab4d6'],
  swellDark: '#74b8d9',
  swellLight: '#98d3ec',
  glint: '#dcf5fd',
  rippleLight: '#eefaff',
  rippleShade: '#66a9d0',
};

/** Darker and greyer, with whiter highlights. */
const ROUGH_SEA: SeaPalette = {
  ...CALM_SEA,
  depth: ['#7ba3bf', '#6890ad', '#567d9c'],
  depthMap: ['#8fb4cc', '#789fba', '#648aa8', '#527795'],
  swellDark: '#5f88a6',
  swellLight: '#86aec8',
  glint: '#e2eff6',
  foam: '#f6f9fb',
  rippleLight: '#dfeaf2',
  rippleShade: '#436a8a',
};

const LOOKS = {
  calm: {
    palette: GENTLE_SEA,
    ripples: 300,
    rippleWait: 1.4,
    whitecaps: 0,
    surfPeriod: 8,
    surfSpeed: 48,
    spray: 0,
  },
  normal: {
    palette: CALM_SEA,
    ripples: 420,
    rippleWait: 1,
    whitecaps: 0,
    surfPeriod: 6,
    surfSpeed: 64,
    spray: 0,
  },
  stormy: {
    palette: ROUGH_SEA,
    ripples: 600,
    rippleWait: 0.55,
    whitecaps: 90,
    surfPeriod: 4,
    surfSpeed: 88,
    spray: 0,
  },
} as const satisfies Record<'calm' | 'normal' | 'stormy', SeaLook>;

/** The look for a match's sea: open water is as gentle as calm, and no choice is the normal sea. */
export function seaLookFor(sea: SeaChoice | undefined): SeaLook {
  if (sea === 'open') {
    return LOOKS.calm;
  }
  return LOOKS[sea ?? 'normal'];
}
