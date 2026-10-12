import { describe, expect, it } from 'vitest';
import {
  FOAM_STEPS,
  SURF_REACH,
  dilate,
  foamMask,
  foamStep,
  haloMask,
  maskFromAlpha,
  minus,
  padMask,
  waveArrival,
  type Mask,
} from '../surfPixels';

/** A small round stone: a 6x5 blob. */
function stone(): Mask {
  const rows = ['.####.', '######', '######', '######', '.####.'];
  const data = new Uint8Array(6 * 5);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      data[y * 6 + x] = c === '#' ? 1 : 0;
    }),
  );
  return { width: 6, height: 5, data };
}

const count = (mask: Mask): number => mask.data.reduce((sum, v) => sum + v, 0);

describe('masks', () => {
  it('come from the alpha of an image', () => {
    const rgba = [0, 0, 0, 255, 0, 0, 0, 0, 9, 9, 9, 200, 1, 1, 1, 10];
    expect(Array.from(maskFromAlpha(rgba, 4, 1).data)).toEqual([1, 0, 1, 0]);
  });

  it('can be padded with empty room all round', () => {
    const padded = padMask(stone(), 3);
    expect(padded.width).toBe(12);
    expect(padded.height).toBe(11);
    expect(count(padded)).toBe(count(stone()));
    expect(padded.data[0]).toBe(0);
  });
});

describe('dilate and minus', () => {
  const padded = padMask(stone(), SURF_REACH);

  it('grows the stone by a radius, and never shrinks it', () => {
    expect(count(dilate(padded, 1))).toBeGreaterThan(count(padded));
    expect(count(dilate(padded, 3))).toBeGreaterThan(count(dilate(padded, 1)));
    const grown = dilate(padded, 2);
    for (let i = 0; i < padded.data.length; i += 1) {
      if (padded.data[i]) expect(grown.data[i]).toBe(1);
    }
  });

  it('makes a ring of what lies between two sizes', () => {
    const ring = minus(dilate(padded, 2), dilate(padded, 1));
    expect(count(ring)).toBeGreaterThan(0);
    for (let i = 0; i < ring.data.length; i += 1) {
      if (ring.data[i]) expect(padded.data[i]).toBe(0);
    }
  });

  it('keeps the stone and its surf inside the padded canvas', () => {
    const outer = dilate(padded, 4);
    for (let x = 0; x < padded.width; x += 1) {
      expect(outer.data[x]).toBe(0);
      expect(outer.data[(padded.height - 1) * padded.width + x]).toBe(0);
    }
  });
});

describe('the halo', () => {
  const padded = padMask(stone(), SURF_REACH);
  const halo = haloMask(padded);

  it('is a ring round the stone that never covers it', () => {
    expect(count(halo)).toBeGreaterThan(count(stone()));
    for (let i = 0; i < halo.data.length; i += 1) {
      if (padded.data[i]) expect(halo.data[i]).toBe(0);
    }
  });

  it('breaks up at its edge, so it fades into the sea', () => {
    const solid = minus(dilate(padded, 3), padded);
    expect(count(halo)).toBeGreaterThan(count(solid));
    const full = minus(dilate(padded, 4), padded);
    expect(count(halo)).toBeLessThan(count(full));
  });
});

describe('the foam', () => {
  const padded = padMask(stone(), SURF_REACH);

  it('is nothing at the start and end of a wash, rings in between', () => {
    expect(count(foamMask(padded, 0))).toBe(0);
    expect(count(foamMask(padded, 5))).toBe(0);
    for (const step of [1, 2, 3, 4]) {
      expect(count(foamMask(padded, step)), `step ${step}`).toBeGreaterThan(0);
    }
  });

  it('moves out from the stone step by step', () => {
    const meanDistance = (mask: Mask): number => {
      const cx = padded.width / 2;
      const cy = padded.height / 2;
      let total = 0;
      let n = 0;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (mask.data[y * mask.width + x]) {
            total += Math.hypot(x - cx, y - cy);
            n += 1;
          }
        }
      }
      return total / n;
    };
    expect(meanDistance(foamMask(padded, 2))).toBeGreaterThan(meanDistance(foamMask(padded, 1)));
    expect(meanDistance(foamMask(padded, 3))).toBeGreaterThan(meanDistance(foamMask(padded, 2)));
    expect(meanDistance(foamMask(padded, 4))).toBeGreaterThan(meanDistance(foamMask(padded, 3)));
  });

  it('never covers the stone', () => {
    for (const step of [1, 2, 3, 4]) {
      const foam = foamMask(padded, step);
      for (let i = 0; i < foam.data.length; i += 1) {
        if (padded.data[i]) expect(foam.data[i]).toBe(0);
      }
    }
  });
});

describe('the timing of a wash', () => {
  it('goes through every step once a period', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 6; t += 0.1) seen.add(foamStep(t, 0, 6));
    expect([...seen].sort()).toEqual(Array.from({ length: FOAM_STEPS }, (_, i) => i));
  });

  it('repeats every period and starts later for a later wave', () => {
    expect(foamStep(1.3, 0, 6)).toBe(foamStep(7.3, 0, 6));
    expect(foamStep(0, 2, 6)).toBe(foamStep(-2, 0, 6));
    expect(foamStep(0, 0, 6)).toBe(0);
  });

  it('reaches stones further along the swell later', () => {
    const east = [1, 0] as const;
    expect(waveArrival(640, 0, east, 64)).toBe(10);
    expect(waveArrival(0, 640, east, 64)).toBe(0);
    expect(waveArrival(100, 0, [-1, 0], 50)).toBeLessThan(0);
    expect(waveArrival(64, 64, [1, 1], 64)).toBe(2);
  });
});
