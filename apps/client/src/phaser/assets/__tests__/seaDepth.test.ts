import { describe, expect, it } from 'vitest';
import {
  DEPTH_LEVELS,
  fractalNoise,
  generateDepthLevels,
  levelsToRgba,
  valueNoise,
  type DepthInput,
} from '../seaDepth';

/** A 640 x 640 pixel sea with a 320 x 320 board in the middle, rocks in the left half and a whirlpool on the right. */
function sea(seed: number, overrides: Partial<DepthInput> = {}): DepthInput {
  return {
    width: 640,
    height: 640,
    board: { x: 160, y: 160, width: 320, height: 320 },
    rocks: [
      { x: 220, y: 240 },
      { x: 240, y: 262 },
      { x: 232, y: 380 },
      { x: 300, y: 300 },
    ],
    whirlpools: [{ x: 410, y: 320 }],
    seed,
    ...overrides,
  };
}

const at = (levels: Uint8Array, width: number, x: number, y: number): number => levels[y * width + x];

describe('the noise', () => {
  it('stays in range, is the same for the same seed, and never repeats', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = valueNoise(i * 7.3, i * 3.1, 100, 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(fractalNoise(i * 11, i * 5, 3)).toBe(fractalNoise(i * 11, i * 5, 3));
    }
    // No period in sight: far apart points are not the same.
    let same = 0;
    for (let i = 0; i < 100; i += 1) {
      if (Math.abs(fractalNoise(i * 13, 40, 3) - fractalNoise(i * 13 + 512, 40, 3)) < 1e-9) same += 1;
    }
    expect(same).toBe(0);
  });

  it('is smooth: neighbouring points differ very little', () => {
    for (let x = 0; x < 300; x += 1) {
      expect(Math.abs(fractalNoise(x, 50, 9) - fractalNoise(x + 1, 50, 9))).toBeLessThan(0.05);
    }
  });
});

describe('the depth of the sea', () => {
  const input = sea(4);
  const levels = generateDepthLevels(input);

  it('gives every pixel one of four levels', () => {
    expect(levels).toHaveLength(input.width * input.height);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThan(DEPTH_LEVELS);
    }
  });

  it('uses every level, with the shallowest the rarest', () => {
    const counts = new Array<number>(DEPTH_LEVELS).fill(0);
    for (const level of levels) counts[level] += 1;
    for (const count of counts) expect(count).toBeGreaterThan(0);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[0]).toBeLessThan(counts[2]);
  });

  it('is the same for the same board and seed, and different for another seed', () => {
    expect(Array.from(generateDepthLevels(sea(4)))).toEqual(Array.from(levels));
    expect(Array.from(generateDepthLevels(sea(5)))).not.toEqual(Array.from(levels));
  });

  it('is shallower round the rocks than away from them', () => {
    const mean = (near: boolean): number => {
      let total = 0;
      let n = 0;
      for (let y = 160; y < 480; y += 2) {
        for (let x = 160; x < 480; x += 2) {
          const distance = Math.min(...input.rocks.map((r) => Math.hypot(r.x - x, r.y - y)));
          if (near ? distance < 30 : distance > 120) {
            total += at(levels, input.width, x, y);
            n += 1;
          }
        }
      }
      return total / n;
    };
    expect(mean(true)).toBeLessThan(mean(false) - 0.3);
  });

  it('is deeper round a whirlpool than the same board without it', () => {
    const without = generateDepthLevels(sea(4, { whirlpools: [] }));
    let deeper = 0;
    let shallower = 0;
    for (let y = 290; y < 350; y += 1) {
      for (let x = 380; x < 440; x += 1) {
        const a = at(levels, input.width, x, y);
        const b = at(without, input.width, x, y);
        if (a > b) deeper += 1;
        if (a < b) shallower += 1;
      }
    }
    expect(deeper).toBeGreaterThan(shallower * 2);
  });

  it('is open sea, the deepest level, at the edge of the picture', () => {
    for (let i = 0; i < input.width; i += 1) {
      expect(at(levels, input.width, i, 0)).toBe(DEPTH_LEVELS - 1);
      expect(at(levels, input.width, i, input.height - 1)).toBe(DEPTH_LEVELS - 1);
      expect(at(levels, input.width, 0, i)).toBe(DEPTH_LEVELS - 1);
      expect(at(levels, input.width, input.width - 1, i)).toBe(DEPTH_LEVELS - 1);
    }
  });

  it('forms patches, not speckle: most pixels match the one beside them', () => {
    let different = 0;
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width - 1; x += 1) {
        if (at(levels, input.width, x, y) !== at(levels, input.width, x + 1, y)) different += 1;
      }
    }
    expect(different / (input.width * input.height)).toBeLessThan(0.14);
  });

  it('does not repeat: shifted by the size of an old tile it is a different picture', () => {
    let different = 0;
    let total = 0;
    for (let y = 160; y < 480; y += 3) {
      for (let x = 160; x < 400; x += 3) {
        total += 1;
        if (at(levels, input.width, x, y) !== at(levels, input.width, x + 128, y)) different += 1;
      }
    }
    expect(different / total).toBeGreaterThan(0.1);
  });
});

describe('levelsToRgba', () => {
  it('paints each level in its colour, opaque', () => {
    const rgba = levelsToRgba(new Uint8Array([0, 1, 3]), ['#010203', '#040506', '#070809', '#0a0b0c']);
    expect(Array.from(rgba)).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 10, 11, 12, 255]);
  });
});
