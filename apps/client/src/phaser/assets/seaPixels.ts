/**
 * The pixel-art sea, drawn from noise. Instead of tiling one small picture
 * (which repeats every cell), the sea is a few big seamless layers of different
 * sizes that drift at different speeds, so the way they line up keeps changing.
 *
 * Everything here is a plain function of a seed, so it can be tested and gives
 * the same sea for the same board. `PeriodicNoise` repeats exactly every `size`
 * pixels both ways, which is what lets a layer tile without a seam.
 */

export type Rgba = readonly [number, number, number, number];

/** A small seeded random number generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Smooth value noise that wraps: the value at x + size is the value at x, and
 * likewise for y. `cellX` and `cellY` are the distance between lattice points,
 * which may differ to stretch features one way (a long, low swell). Two octaves
 * give some detail on top of the broad shapes. Values run from 0 to 1.
 */
export class PeriodicNoise {
  private readonly layers: Array<{ w: number; h: number; cx: number; cy: number; values: Float32Array }>;

  constructor(
    seed: number,
    readonly size: number,
    cellX: number,
    cellY: number,
  ) {
    if (size % cellX !== 0 || size % cellY !== 0) {
      throw new Error(`cells ${cellX}x${cellY} do not divide ${size}`);
    }
    const random = seededRandom(seed);
    this.layers = [1, 2].map((octave) => {
      const cx = Math.max(1, Math.floor(cellX / octave));
      const cy = Math.max(1, Math.floor(cellY / octave));
      const w = Math.floor(size / cx);
      const h = Math.floor(size / cy);
      const values = new Float32Array(w * h);
      for (let i = 0; i < values.length; i += 1) {
        values[i] = random();
      }
      return { w, h, cx: size / w, cy: size / h, values };
    });
  }

  value(x: number, y: number): number {
    let total = 0;
    let weight = 0;
    this.layers.forEach((layer, index) => {
      const w = index === 0 ? 0.68 : 0.32;
      const gx = x / layer.cx;
      const gy = y / layer.cy;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const at = (ix: number, iy: number): number =>
        layer.values[(((iy % layer.h) + layer.h) % layer.h) * layer.w + (((ix % layer.w) + layer.w) % layer.w)];
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      total += (top * (1 - ty) + bottom * ty) * w;
      weight += w;
    });
    return total / weight;
  }
}

/** The colours of one sea. */
export interface SeaPalette {
  /** The water in its three depths, lightest first (the tiled depth layer of the older `lines` sea). */
  readonly depth: readonly [string, string, string];
  /** The four levels of the depth map worked out from the board: over a reef, then shallow, mid and open sea. */
  readonly depthMap: readonly [string, string, string, string];
  /** The darker line of a swell, and the lighter line beside it. */
  readonly swellDark: string;
  readonly swellLight: string;
  /** Short flecks of chop. */
  readonly chop: string;
  /** Twinkles (drawn separately as sprites). */
  readonly glint: string;
  /** Foam and whitecaps. */
  readonly foam: string;
  /** The soft bands of a passing swell: a lighter and a darker one (laid over the water, mostly see-through). */
  readonly bandLight: string;
  readonly bandDark: string;
  /** Ripples: the light mark and the shade under it. */
  readonly rippleLight: string;
  readonly rippleShade: string;
}

export const CALM_SEA: SeaPalette = {
  depth: ['#80c0e4', '#6fb1d9', '#5ea2cf'],
  depthMap: ['#9ccfec', '#82c1e5', '#70b2da', '#5fa3d0'],
  swellDark: '#69abd3',
  swellLight: '#8cc8e8',
  chop: '#92cdea',
  glint: '#cfeefb',
  foam: '#f2fbff',
  bandLight: '#ffffff',
  bandDark: '#1d5d99',
  rippleLight: '#e6f5fd',
  rippleShade: '#5d9ccb',
};

/** A short tag for a palette, so textures painted in different palettes get different keys. */
export const paletteTag = (palette: SeaPalette): string => palette.depthMap[3].slice(1);

/** How much of the water shows through a band (0 to 255). */
const BAND_ALPHA_LIGHT = 26;
const BAND_ALPHA_DARK = 22;

/** Pixels along one side of a sea layer. Every noise cell size used below divides it. */
export const SEA_LAYER_SIZE = 512;

/** Which way a swell's lines run: along x (lines lie across) or along y (lines stand up). */
export type SwellAxis = 'x' | 'y';

function parse(colour: string): Rgba {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
    255,
  ];
}

function paint(data: Uint8ClampedArray, size: number, x: number, y: number, rgba: Rgba): void {
  const wx = ((x % size) + size) % size;
  const wy = ((y % size) + size) % size;
  const index = (wy * size + wx) * 4;
  data[index] = rgba[0];
  data[index + 1] = rgba[1];
  data[index + 2] = rgba[2];
  data[index + 3] = rgba[3];
}

/**
 * The water itself: three shades of blue in broad, soft-edged patches, like
 * deeper and shallower stretches. Opaque.
 */
export function depthLayer(seed: number, palette: SeaPalette, size = SEA_LAYER_SIZE): Uint8ClampedArray {
  // Big patches: the lattice is two cells across, so a patch is a good part of the board.
  const noise = new PeriodicNoise(seed, size, 256, 256);
  const shades = palette.depth.map(parse);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = noise.value(x, y);
      paint(data, size, x, y, n < 0.42 ? shades[0] : n < 0.6 ? shades[1] : shades[2]);
    }
  }
  return data;
}

/**
 * Lines of swell: the contour of a smooth field, so each line curves and
 * wanders like a real crest, with the lines stretched along one axis. Only
 * parts of the contour are drawn (a second field decides where), so a crest is
 * a stretch of line that begins and ends, not a ruled line across the sea. Each
 * is a pixel of darker blue with a pixel of lighter blue above it. Transparent
 * except for the lines.
 */
export function swellLayer(
  seed: number,
  palette: SeaPalette,
  axis: SwellAxis,
  size = SEA_LAYER_SIZE,
): Uint8ClampedArray {
  const [cellX, cellY] = axis === 'x' ? [128, 32] : [32, 128];
  const field = new PeriodicNoise(seed, size, cellX, cellY);
  const where = new PeriodicNoise(seed ^ 0x9e3779b9, size, 64, 64);
  const dark = parse(palette.swellDark);
  const light = parse(palette.swellLight);
  const data = new Uint8ClampedArray(size * size * 4);

  const level = 0.5;
  const marked = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const here = field.value(x, y) - level;
      const crosses =
        here * (field.value(x + 1, y) - level) <= 0 || here * (field.value(x, y + 1) - level) <= 0;
      if (crosses && where.value(x, y) > 0.5) {
        marked[y * size + x] = 1;
      }
    }
  }
  // A lighter pixel above each darker one, then the darker ones on top.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (marked[y * size + x]) {
        paint(data, size, x, y - 1, light);
      }
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (marked[y * size + x]) {
        paint(data, size, x, y, dark);
      }
    }
  }
  return data;
}

/**
 * Short flecks of chop between the swells: small, light, and sparse. They lie
 * the same way as the swell (`axis`), so the two never cross each other.
 * Transparent.
 */
export function chopLayer(
  seed: number,
  palette: SeaPalette,
  axis: SwellAxis,
  size = SEA_LAYER_SIZE,
): Uint8ClampedArray {
  const [cellX, cellY] = axis === 'x' ? [64, 16] : [16, 64];
  const field = new PeriodicNoise(seed ^ 0x51ed270b, size, cellX, cellY);
  const where = new PeriodicNoise(seed ^ 0x2545f491, size, 64, 64);
  const chop = parse(palette.chop);
  const data = new Uint8ClampedArray(size * size * 4);
  const level = 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const here = field.value(x, y) - level;
      // Cross a level going across the stretch, so the flecks lie along it.
      const crosses =
        axis === 'x'
          ? here * (field.value(x, y + 1) - level) <= 0
          : here * (field.value(x + 1, y) - level) <= 0;
      if (crosses && where.value(x, y) > 0.62) {
        paint(data, size, x, y, chop);
      }
    }
  }
  return data;
}

/**
 * A passing swell as broad, soft bands: a lighter band, then plain water, then
 * a darker band, over and over across the direction of travel, bent a little by
 * noise so no band is a ruler line. They have no thin lines in them, only a
 * slight change of shade, mostly see-through. `axis` x means the bands lie
 * flat (the swell travels up or down). The picture repeats every 128 pixels
 * along the travel direction, so it tiles and can be scrolled.
 */
export function bandLayer(
  seed: number,
  palette: SeaPalette,
  axis: SwellAxis,
  size = SEA_LAYER_SIZE,
): Uint8ClampedArray {
  const warp = new PeriodicNoise(seed ^ 0x7f4a7c15, size, 128, 128);
  const light = parse(palette.bandLight);
  const dark = parse(palette.bandDark);
  const lightBand: Rgba = [light[0], light[1], light[2], BAND_ALPHA_LIGHT];
  const darkBand: Rgba = [dark[0], dark[1], dark[2], BAND_ALPHA_DARK];
  const data = new Uint8ClampedArray(size * size * 4);
  // Narrow bands, much closer together than the patches of depth, so the two
  // read as different things: depth is a broad stain, the swell is a fine stripe.
  const wavelength = size / 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const along = axis === 'x' ? y : x;
      const phase = along / wavelength + (warp.value(x, y) - 0.5) * 0.8;
      const swell = Math.sin(phase * Math.PI * 2);
      if (swell > 0.55) {
        paint(data, size, x, y, lightBand);
      } else if (swell < -0.6) {
        paint(data, size, x, y, darkBand);
      }
    }
  }
  return data;
}

/** The share of pixels in a layer that are not see-through. */
export function coverage(data: Uint8ClampedArray): number {
  let marked = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) marked += 1;
  }
  return marked / (data.length / 4);
}

/** A repeatable 32-bit hash of any text, for turning a board into a seed. */
export function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The four ways a swell can travel, clockwise from north. Only straight ones:
 * a diagonal swell would need diagonal crests, and crests running one way while
 * the water moves another looks wrong.
 */
export const SWELL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** The swell direction and the lines' axis for a board's seed. */
export function swellFor(seed: number): { direction: readonly [number, number]; axis: SwellAxis } {
  const direction = SWELL_DIRECTIONS[seed % SWELL_DIRECTIONS.length];
  // Crests are at right angles to the way they travel.
  const axis: SwellAxis = Math.abs(direction[0]) > Math.abs(direction[1]) ? 'y' : 'x';
  return { direction, axis };
}
