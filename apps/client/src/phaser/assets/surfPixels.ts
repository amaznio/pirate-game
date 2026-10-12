/**
 * Surf round the rocks, traced from each stone's own outline: a pale halo of
 * shallow water, and rings of foam that wash out from the stone and fade, like
 * a wave running up and back. Plain functions on pixel masks, so the shapes can
 * be tested; BootScene paints them onto textures.
 */

export interface Mask {
  readonly width: number;
  readonly height: number;
  /** 1 where the stone is, row by row. */
  readonly data: Uint8Array;
}

/** A mask of the pixels that are not see-through, from RGBA data. */
export function maskFromAlpha(rgba: ArrayLike<number>, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = rgba[i * 4 + 3] > 20 ? 1 : 0;
  }
  return { width, height, data };
}

/** The same mask on a bigger canvas, with `by` empty pixels added on every side. */
export function padMask(mask: Mask, by: number): Mask {
  const width = mask.width + by * 2;
  const height = mask.height + by * 2;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      data[(y + by) * width + (x + by)] = mask.data[y * mask.width + x];
    }
  }
  return { width, height, data };
}

/** Every pixel within `radius` (round, not square) of the stone, the stone included. */
export function dilate(mask: Mask, radius: number): Mask {
  const { width, height } = mask;
  const data = new Uint8Array(width * height);
  const limit = radius * radius + radius * 0.5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask.data[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > limit) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            data[ny * width + nx] = 1;
          }
        }
      }
    }
  }
  return { width, height, data };
}

/** What is in `outer` but not in `inner`. */
export function minus(outer: Mask, inner: Mask): Mask {
  const data = new Uint8Array(outer.data.length);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = outer.data[i] && !inner.data[i] ? 1 : 0;
  }
  return { width: outer.width, height: outer.height, data };
}

/** How many pixels of empty room to leave round a stone for its surf. */
export const SURF_REACH = 5;

/** Steps in one wash of foam: nothing, three rings out, a broken ring, nothing. */
export const FOAM_STEPS = 6;

/**
 * The shallows: a ring of pale water close round the stone, then a broken
 * (every other pixel) edge so it fades into the sea. `padded` is the stone mask
 * already padded by `SURF_REACH`.
 */
export function haloMask(padded: Mask): Mask {
  const solid = minus(dilate(padded, 3), padded);
  const outer = minus(dilate(padded, 4), dilate(padded, 3));
  const data = new Uint8Array(solid.data.length);
  for (let y = 0; y < padded.height; y += 1) {
    for (let x = 0; x < padded.width; x += 1) {
      const i = y * padded.width + x;
      data[i] = solid.data[i] || (outer.data[i] && (x + y) % 2 === 0) ? 1 : 0;
    }
  }
  return { width: padded.width, height: padded.height, data };
}

/**
 * One step of a wash of foam: step 1 is a ring touching the stone, 2 and 3 are
 * rings further out, 4 is a broken ring at the edge that is fading, and 0 and 5
 * are nothing (the water has drawn back).
 */
export function foamMask(padded: Mask, step: number): Mask {
  const empty = { width: padded.width, height: padded.height, data: new Uint8Array(padded.data.length) };
  if (step < 1 || step > 4) {
    return empty;
  }
  if (step === 4) {
    const ring = minus(dilate(padded, 4), dilate(padded, 3));
    const data = new Uint8Array(ring.data.length);
    for (let y = 0; y < ring.height; y += 1) {
      for (let x = 0; x < ring.width; x += 1) {
        const i = y * ring.width + x;
        data[i] = ring.data[i] && (x + y) % 2 === 1 ? 1 : 0;
      }
    }
    return { width: ring.width, height: ring.height, data };
  }
  return minus(dilate(padded, step), dilate(padded, step - 1));
}

/** Which step of the wash a stone is at, `seconds` into the show, given when its wave arrives. */
export function foamStep(seconds: number, arrival: number, period: number): number {
  const into = (((seconds - arrival) % period) + period) % period;
  return Math.floor((into / period) * FOAM_STEPS);
}

/**
 * When the wave reaches a stone, in seconds: waves come in the swell direction,
 * so a stone further along it is reached later. `pixelsPerSecond` is how fast
 * the wave runs across the board.
 */
export function waveArrival(
  x: number,
  y: number,
  direction: readonly [number, number],
  pixelsPerSecond: number,
): number {
  return (x * direction[0] + y * direction[1]) / pixelsPerSecond;
}
