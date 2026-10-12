import { describe, expect, it } from 'vitest';
import {
  CALM_SEA,
  PeriodicNoise,
  SEA_LAYER_SIZE,
  SWELL_DIRECTIONS,
  bandLayer,
  chopLayer,
  coverage,
  depthLayer,
  hashText,
  seededRandom,
  swellFor,
  swellLayer,
} from '../seaPixels';

/** A small layer size keeps the tests quick; every cell size divides it. */
const SIZE = 256;

describe('PeriodicNoise', () => {
  const noise = new PeriodicNoise(7, SIZE, 64, 32);

  it('stays between 0 and 1 and is smooth', () => {
    let previous = noise.value(0, 0);
    for (let x = 1; x < SIZE; x += 1) {
      const value = noise.value(x, 10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.12);
      previous = value;
    }
  });

  it('repeats exactly every size, both ways (so a layer has no seam)', () => {
    for (const [x, y] of [[0, 0], [13, 200], [255, 255], [100, 3]]) {
      expect(noise.value(x + SIZE, y)).toBeCloseTo(noise.value(x, y), 9);
      expect(noise.value(x, y + SIZE)).toBeCloseTo(noise.value(x, y), 9);
      expect(noise.value(x - SIZE, y - SIZE)).toBeCloseTo(noise.value(x, y), 9);
    }
  });

  it('is the same for the same seed and different for another', () => {
    const same = new PeriodicNoise(7, SIZE, 64, 32);
    const other = new PeriodicNoise(8, SIZE, 64, 32);
    expect(same.value(50, 60)).toBe(noise.value(50, 60));
    expect(other.value(50, 60)).not.toBe(noise.value(50, 60));
  });

  it('rejects cells that do not fit the size', () => {
    expect(() => new PeriodicNoise(1, 100, 64, 64)).toThrow();
  });

  it('stretches features along the long cell', () => {
    // With cells 128 wide and 16 tall the field changes far faster going down than across.
    const stretched = new PeriodicNoise(3, SIZE, 128, 16);
    let across = 0;
    let down = 0;
    for (let i = 0; i < SIZE - 1; i += 1) {
      across += Math.abs(stretched.value(i + 1, 40) - stretched.value(i, 40));
      down += Math.abs(stretched.value(40, i + 1) - stretched.value(40, i));
    }
    expect(down).toBeGreaterThan(across * 1.5);
  });
});

describe('the sea layers', () => {
  const depth = depthLayer(11, CALM_SEA, SIZE);
  const swell = swellLayer(11, CALM_SEA, 'x', SIZE);
  const chop = chopLayer(11, CALM_SEA, 'x', SIZE);

  it('make the water from three shades, all opaque', () => {
    // The patches are big, so a small test layer may not reach every shade: look at several full-size ones.
    const colours = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const layer = depthLayer(seed, CALM_SEA);
      expect(coverage(layer)).toBe(1);
      for (let i = 0; i < layer.length; i += 4) colours.add(`${layer[i]},${layer[i + 1]},${layer[i + 2]}`);
    }
    expect(colours.size).toBe(3);
    expect(coverage(depth)).toBe(1);
  });

  it('use all three depths across a full-size layer, in patches rather than dust', () => {
    // A full-size layer has a 4x4 lattice of patches, so check several boards together.
    const counts = new Map<string, number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const layer = depthLayer(seed, CALM_SEA);
      for (let i = 0; i < layer.length; i += 4) {
        const key = `${layer[i]},${layer[i + 1]},${layer[i + 2]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(3);
    for (const count of counts.values()) {
      expect(count / (6 * SEA_LAYER_SIZE * SEA_LAYER_SIZE)).toBeGreaterThan(0.1);
    }
  });

  it('keep the swell and chop sparse, so the sea stays calm', () => {
    expect(coverage(swell)).toBeGreaterThan(0.01);
    expect(coverage(swell)).toBeLessThan(0.12);
    expect(coverage(chop)).toBeGreaterThan(0.002);
    expect(coverage(chop)).toBeLessThan(0.06);
  });

  it('are the same for the same seed and different for another', () => {
    expect(Array.from(swellLayer(11, CALM_SEA, 'x', SIZE))).toEqual(Array.from(swell));
    expect(Array.from(swellLayer(12, CALM_SEA, 'x', SIZE))).not.toEqual(Array.from(swell));
    expect(Array.from(depthLayer(12, CALM_SEA, SIZE))).not.toEqual(Array.from(depth));
  });

  it('do not repeat inside a layer: shifted by half the layer or a cell, it is a different picture', () => {
    const differs = (layer: Uint8ClampedArray, dx: number, dy: number): number => {
      let different = 0;
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const a = (y * SIZE + x) * 4 + 3;
          const b = ((((y + dy) % SIZE) * SIZE) + ((x + dx) % SIZE)) * 4 + 3;
          if (layer[a] !== layer[b]) different += 1;
        }
      }
      return different / (SIZE * SIZE);
    };
    for (const [dx, dy] of [[64, 0], [0, 64], [SIZE / 2, SIZE / 2], [32, 32]]) {
      expect(differs(swell, dx, dy), `swell ${dx},${dy}`).toBeGreaterThan(0.02);
    }
  });

  it('draw lines that begin and end: swell pixels have swell neighbours but not every row is full', () => {
    // No row is a ruled line from edge to edge.
    let fullRows = 0;
    for (let y = 0; y < SIZE; y += 1) {
      let marked = 0;
      for (let x = 0; x < SIZE; x += 1) if (swell[(y * SIZE + x) * 4 + 3] > 0) marked += 1;
      if (marked > SIZE * 0.9) fullRows += 1;
    }
    expect(fullRows).toBe(0);
  });

  it('has chop that lies the same way as the swell, so the two never cross', () => {
    // Pixels in a row for horizontal lines, in a column for vertical ones.
    const longest = (layer: Uint8ClampedArray, along: 'x' | 'y'): number => {
      let best = 0;
      for (let a = 0; a < SIZE; a += 1) {
        let run = 0;
        for (let b = 0; b < SIZE; b += 1) {
          const index = along === 'x' ? (a * SIZE + b) * 4 + 3 : (b * SIZE + a) * 4 + 3;
          run = layer[index] > 0 ? run + 1 : 0;
          best = Math.max(best, run);
        }
      }
      return best;
    };
    const flatChop = chopLayer(11, CALM_SEA, 'x', SIZE);
    const upChop = chopLayer(11, CALM_SEA, 'y', SIZE);
    expect(longest(flatChop, 'x')).toBeGreaterThan(longest(flatChop, 'y'));
    expect(longest(upChop, 'y')).toBeGreaterThan(longest(upChop, 'x'));
  });

  it('run along the other axis when asked', () => {
    const across = swellLayer(11, CALM_SEA, 'y', SIZE);
    // For lines stretched along x there are more marked pixels per row than per column.
    const rowSpread = (layer: Uint8ClampedArray): number => {
      const rows: number[] = [];
      for (let y = 0; y < SIZE; y += 1) {
        let n = 0;
        for (let x = 0; x < SIZE; x += 1) if (layer[(y * SIZE + x) * 4 + 3] > 0) n += 1;
        rows.push(n);
      }
      const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
      return rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length;
    };
    expect(rowSpread(swell)).not.toBeCloseTo(rowSpread(across), 0);
  });
});

describe('the swell bands', () => {
  const bands = bandLayer(11, CALM_SEA, 'x', SIZE);
  const alphaAt = (layer: Uint8ClampedArray, x: number, y: number): number =>
    layer[(((y % SIZE) + SIZE) % SIZE * SIZE + (((x % SIZE) + SIZE) % SIZE)) * 4 + 3];

  it('are two soft shades laid over the water, and mostly see-through', () => {
    const alphas = new Set<number>();
    for (let i = 3; i < bands.length; i += 4) alphas.add(bands[i]);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 22, 26]);
    for (const alpha of alphas) expect(alpha).toBeLessThan(40);
  });

  it('cover a good part of the sea in broad bands, with plain water between', () => {
    expect(coverage(bands)).toBeGreaterThan(0.5);
    expect(coverage(bands)).toBeLessThan(0.9);
  });

  it('have no thin lines: a band is wide, not a pixel or two', () => {
    // Walk down a column across the bands: every run of one shade is long.
    let shortRuns = 0;
    let runs = 0;
    for (const x of [10, 100, 200]) {
      let run = 1;
      for (let y = 1; y < SIZE; y += 1) {
        if (alphaAt(bands, x, y) === alphaAt(bands, x, y - 1)) {
          run += 1;
        } else {
          runs += 1;
          if (run < 8) shortRuns += 1;
          run = 1;
        }
      }
    }
    expect(runs).toBeGreaterThan(0);
    expect(shortRuns / runs).toBeLessThan(0.15);
  });

  it('lie across the way the swell travels', () => {
    // Flat bands change going down a column far more than going along a row.
    let across = 0;
    let down = 0;
    for (let i = 0; i < SIZE - 1; i += 1) {
      if (alphaAt(bands, i, 50) !== alphaAt(bands, i + 1, 50)) across += 1;
      if (alphaAt(bands, 50, i) !== alphaAt(bands, 50, i + 1)) down += 1;
    }
    expect(down).toBeGreaterThan(across);
    const upright = bandLayer(11, CALM_SEA, 'y', SIZE);
    let acrossUp = 0;
    let downUp = 0;
    for (let i = 0; i < SIZE - 1; i += 1) {
      if (alphaAt(upright, i, 50) !== alphaAt(upright, i + 1, 50)) acrossUp += 1;
      if (alphaAt(upright, 50, i) !== alphaAt(upright, 50, i + 1)) downUp += 1;
    }
    expect(acrossUp).toBeGreaterThan(downUp);
  });

  it('repeat along the swell, so the layer tiles and scrolls without a seam', () => {
    for (const [x, y] of [[0, 0], [37, 200], [255, 99]]) {
      expect(alphaAt(bands, x + SIZE, y)).toBe(alphaAt(bands, x, y));
      expect(alphaAt(bands, x, y + SIZE)).toBe(alphaAt(bands, x, y));
    }
  });
});

describe('seeds and swell', () => {
  it('turn text into the same number every time', () => {
    expect(hashText('rock-1@3,4')).toBe(hashText('rock-1@3,4'));
    expect(hashText('rock-1@3,4')).not.toBe(hashText('rock-1@3,5'));
  });

  it('gives a repeatable random sequence', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('picks one of four straight directions, with crests at right angles to it', () => {
    for (let seed = 0; seed < 16; seed += 1) {
      const { direction, axis } = swellFor(seed);
      expect(SWELL_DIRECTIONS).toContain(direction);
      if (Math.abs(direction[0]) > Math.abs(direction[1])) {
        expect(axis).toBe('y');
      } else {
        expect(axis).toBe('x');
      }
    }
    expect(new Set(Array.from({ length: 16 }, (_, seed) => swellFor(seed).direction)).size).toBe(4);
    // Never a diagonal: crests and travel agree.
    for (const direction of SWELL_DIRECTIONS) {
      expect(Math.abs(direction[0]) + Math.abs(direction[1])).toBe(1);
    }
  });
});
