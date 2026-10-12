/**
 * The depth of the sea, worked out from the board instead of tiled: fractal
 * noise (so it never repeats), bent by a second field (so its patches curve
 * like real shoals), made shallower round every rock and deeper round every
 * whirlpool, and deepest of all out past the edge of the board. It comes out as
 * four levels, from the pale water over a reef to the dark of open sea, with a
 * light dither at the edges between levels, as pixel art does.
 *
 * Everything is a plain function of the seed and the board, in art pixels, so
 * it can be tested and gives the same sea for the same board.
 */

export const DEPTH_LEVELS = 4;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DepthInput {
  /** Size of the picture, in art pixels. */
  readonly width: number;
  readonly height: number;
  /** Where the board lies in the picture, in art pixels. */
  readonly board: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Rock and whirlpool-centre positions, in art pixels. */
  readonly rocks: readonly Point[];
  readonly whirlpools: readonly Point[];
  readonly seed: number;
}

/** A repeatable number in [0, 1) for a lattice point. */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise with no repeat: values in [0, 1], features about one `cell` across. */
export function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const top = hash(x0, y0, seed) * (1 - tx) + hash(x0 + 1, y0, seed) * tx;
  const bottom = hash(x0, y0 + 1, seed) * (1 - tx) + hash(x0 + 1, y0 + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Three octaves of noise, the broad shapes first; roughly 0.25 to 0.75. */
export function fractalNoise(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, 220, seed) * 0.55 +
    valueNoise(x, y, 110, seed + 1) * 0.3 +
    valueNoise(x, y, 55, seed + 2) * 0.15
  );
}

/** How far a point may be bent by the warp field, in art pixels. */
const WARP = 70;

/** How much a rock makes the water shallower, and how far (art pixels) its shoal reaches. */
const SHOAL_DEPTH = 0.62;
const SHOAL_REACH = 48;
/** How much a whirlpool deepens the water round it, and how far. */
const WHIRL_DEPTH = 0.3;
const WHIRL_REACH = 70;
/** How far past the board (art pixels) the water has become open sea. */
const EDGE_FROM = 64;
const EDGE_TO = 192;

/** Where the thresholds between levels lie on the 0 (shallow) to 1 (deep) scale. */
const THRESHOLDS = [0.2, 0.46, 0.7] as const;

/** A 4x4 ordered-dither matrix, in [-0.5, 0.5). */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => value / 16 - 0.5));

/** How wide the dithered edge between two levels is, on the depth scale. */
const DITHER = 0.05;

/**
 * A coarse map of how near points are to any of `points`: a smooth bump (1 on a
 * point, 0 at `reach`) added up, on a grid every `step` pixels, so the big list
 * is only walked once and every pixel then just looks the grid up.
 */
function influenceGrid(
  points: readonly Point[],
  width: number,
  height: number,
  step: number,
  reach: number,
): { cols: number; rows: number; data: Float32Array } {
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const data = new Float32Array(cols * rows);
  const span = Math.ceil(reach / step);
  for (const point of points) {
    const cx = Math.round(point.x / step);
    const cy = Math.round(point.y / step);
    for (let gy = Math.max(0, cy - span); gy <= Math.min(rows - 1, cy + span); gy += 1) {
      for (let gx = Math.max(0, cx - span); gx <= Math.min(cols - 1, cx + span); gx += 1) {
        const distance = Math.hypot(gx * step - point.x, gy * step - point.y);
        if (distance < reach) {
          const t = 1 - distance / reach;
          data[gy * cols + gx] += t * t * (3 - 2 * t);
        }
      }
    }
  }
  return { cols, rows, data };
}

/** The depth at a point, on a scale from 0 (shallowest) to 1 (open sea), before it is cut into levels. */
export function depthAt(
  x: number,
  y: number,
  seed: number,
  rockShoal: number,
  whirlDeep: number,
  distanceOutside: number,
): number {
  // Bend the point by a slow second field, so patches curve instead of running straight.
  const wx = x + (valueNoise(x + 5000, y, 160, seed + 11) - 0.5) * 2 * WARP;
  const wy = y + (valueNoise(x, y + 9000, 160, seed + 12) - 0.5) * 2 * WARP;
  let depth = fractalNoise(wx, wy, seed) * 0.9 + 0.1;
  depth -= Math.min(1, rockShoal) * SHOAL_DEPTH;
  depth += Math.min(1, whirlDeep) * WHIRL_DEPTH;
  const edge = Math.min(1, Math.max(0, (distanceOutside - EDGE_FROM) / (EDGE_TO - EDGE_FROM)));
  const open = edge * edge * (3 - 2 * edge);
  depth = Math.min(1, Math.max(0, depth)) * (1 - open) + open;
  return depth;
}

/**
 * The depth level (0 shallowest to 3 deepest) of every pixel, row by row. The
 * depth itself changes slowly, so it is worked out only every few pixels and
 * smoothly filled in between; the dither and the cut into levels are done on
 * every pixel, so the edges between levels are still pixel sharp.
 */
export function generateDepthLevels(input: DepthInput): Uint8Array {
  const { width, height, board, seed } = input;
  const step = 4;
  const shoals = influenceGrid(input.rocks, width, height, step, SHOAL_REACH);
  const whirls = influenceGrid(input.whirlpools, width, height, step, WHIRL_REACH);

  // The depth on a coarse grid (the same grid the shoals and whirlpools use).
  const coarse = { cols: shoals.cols, rows: shoals.rows, data: new Float32Array(shoals.cols * shoals.rows) };
  for (let gy = 0; gy < coarse.rows; gy += 1) {
    for (let gx = 0; gx < coarse.cols; gx += 1) {
      const x = gx * step;
      const y = gy * step;
      const outsideX = Math.max(board.x - x, x - (board.x + board.width), 0);
      const outsideY = Math.max(board.y - y, y - (board.y + board.height), 0);
      const i = gy * coarse.cols + gx;
      coarse.data[i] = depthAt(x, y, seed, shoals.data[i], whirls.data[i], Math.hypot(outsideX, outsideY));
    }
  }

  // Fill in each block of step x step pixels from the depth at its four corners.
  const levels = new Uint8Array(width * height);
  const [t0, t1, t2] = THRESHOLDS;
  for (let gy = 0; gy < coarse.rows - 1; gy += 1) {
    for (let gx = 0; gx < coarse.cols - 1; gx += 1) {
      const a = coarse.data[gy * coarse.cols + gx];
      const b = coarse.data[gy * coarse.cols + gx + 1];
      const c = coarse.data[(gy + 1) * coarse.cols + gx];
      const d = coarse.data[(gy + 1) * coarse.cols + gx + 1];
      for (let py = 0; py < step; py += 1) {
        const y = gy * step + py;
        if (y >= height) break;
        const fy = py / step;
        const left = a + (c - a) * fy;
        const right = b + (d - b) * fy;
        const row = BAYER[y & 3];
        for (let px = 0; px < step; px += 1) {
          const x = gx * step + px;
          if (x >= width) break;
          const depth = left + (right - left) * (px / step) + row[x & 3] * DITHER;
          levels[y * width + x] = depth < t0 ? 0 : depth < t1 ? 1 : depth < t2 ? 2 : 3;
        }
      }
    }
  }
  return levels;
}

/** RGBA pixels for a level map, one colour a level (shallowest first). Opaque. */
export function levelsToRgba(levels: Uint8Array, shades: readonly string[]): Uint8ClampedArray {
  const colours = shades.map((shade) => [
    Number.parseInt(shade.slice(1, 3), 16),
    Number.parseInt(shade.slice(3, 5), 16),
    Number.parseInt(shade.slice(5, 7), 16),
  ]);
  const data = new Uint8ClampedArray(levels.length * 4);
  for (let i = 0; i < levels.length; i += 1) {
    const colour = colours[levels[i]];
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}
