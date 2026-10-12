import { describe, expect, it } from 'vitest';
import {
  RIPPLE_FRAMES,
  RIPPLE_FRAME_MS,
  RIPPLE_GLYPHS,
  RIPPLE_LIFE_MS,
  chooseGlyph,
  framePixels,
  glyphSize,
  pictureSize,
  ripplePixel,
  rippleFrameAt,
} from '../ripplePixels';

describe('the ripple glyphs', () => {
  it('have a frame for every step of a life, none of them empty', () => {
    for (const glyph of RIPPLE_GLYPHS) {
      for (let frame = 0; frame < RIPPLE_FRAMES; frame += 1) {
        expect(framePixels(glyph, frame), `${glyph} ${frame}`).toBeGreaterThan(0);
      }
    }
  });

  it('grow, peak in the middle and shrink again', () => {
    for (const glyph of RIPPLE_GLYPHS) {
      const sizes = Array.from({ length: RIPPLE_FRAMES }, (_, frame) => framePixels(glyph, frame));
      const middle = Math.floor(RIPPLE_FRAMES / 2);
      expect(sizes[middle], glyph).toBe(Math.max(...sizes));
      expect(sizes[0], glyph).toBeLessThan(sizes[middle]);
      expect(sizes[RIPPLE_FRAMES - 1], glyph).toBeLessThan(sizes[middle]);
      expect(sizes[0], glyph).toBe(sizes[RIPPLE_FRAMES - 1]);
    }
  });

  it('are wide but low: the biggest is under twenty pixels across and three high', () => {
    for (const glyph of RIPPLE_GLYPHS) {
      expect(glyphSize(glyph).width, glyph).toBeLessThanOrEqual(19);
      expect(glyphSize(glyph).height, glyph).toBeLessThanOrEqual(3);
    }
  });

  it('draw every marked pixel inside their picture, and nothing outside it', () => {
    for (const glyph of RIPPLE_GLYPHS) {
      for (const axis of ['x', 'y'] as const) {
        const { width, height } = pictureSize(glyph, axis);
        for (let frame = 0; frame < RIPPLE_FRAMES; frame += 1) {
          let marked = 0;
          for (let y = -1; y <= height; y += 1) {
            for (let x = -1; x <= width; x += 1) {
              if (ripplePixel(glyph, frame, axis, x, y)) {
                marked += 1;
                expect(x).toBeGreaterThanOrEqual(0);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThan(width);
                expect(y).toBeLessThan(height);
              }
            }
          }
          expect(marked).toBe(framePixels(glyph, frame));
        }
      }
    }
  });

  it('stand on their side when the swell runs the other way', () => {
    const flat = pictureSize('wide', 'x');
    const upright = pictureSize('wide', 'y');
    expect(upright.width).toBe(flat.height);
    expect(upright.height).toBe(flat.width);
    // The same pixel, turned over the diagonal.
    for (let y = 0; y < flat.height; y += 1) {
      for (let x = 0; x < flat.width; x += 1) {
        expect(ripplePixel('wide', 2, 'y', y, x)).toBe(ripplePixel('wide', 2, 'x', x, y));
      }
    }
  });

  it('get wider from the small dash to the arch to the wide arch', () => {
    expect(glyphSize('dash').width).toBeLessThan(glyphSize('arch').width);
    expect(glyphSize('arch').width).toBeLessThan(glyphSize('wide').width);
    expect(glyphSize('wide').width).toBeGreaterThanOrEqual(15);
  });

  it('use both a light and a shade pixel in the arches', () => {
    const seen = new Set<string | null>();
    const { width, height } = glyphSize('arch');
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) seen.add(ripplePixel('arch', 2, 'x', x, y));
    }
    expect(seen.has('light')).toBe(true);
    expect(seen.has('shade')).toBe(true);
  });
});

describe('the life of a ripple', () => {
  it('goes through every frame in turn and is then over', () => {
    const frames = [];
    for (let age = 0; age < RIPPLE_LIFE_MS; age += RIPPLE_FRAME_MS) frames.push(rippleFrameAt(age));
    expect(frames).toEqual([0, 1, 2, 3, 4]);
    expect(rippleFrameAt(RIPPLE_LIFE_MS)).toBe(-1);
    expect(rippleFrameAt(-1)).toBe(-1);
    expect(rippleFrameAt(RIPPLE_LIFE_MS - 1)).toBe(RIPPLE_FRAMES - 1);
  });

  it('lasts about a second and a half', () => {
    expect(RIPPLE_LIFE_MS).toBeGreaterThan(1000);
    expect(RIPPLE_LIFE_MS).toBeLessThan(2500);
  });
});

describe('choosing a glyph', () => {
  it('prefers small dashes, then arches, with a few wide ones', () => {
    const counts = { dash: 0, arch: 0, wide: 0 };
    for (let i = 0; i < 1000; i += 1) counts[chooseGlyph(i / 1000)] += 1;
    expect(counts.dash).toBeGreaterThan(counts.arch);
    expect(counts.arch).toBeGreaterThan(counts.wide);
    expect(counts.wide).toBeGreaterThan(50);
  });
});
