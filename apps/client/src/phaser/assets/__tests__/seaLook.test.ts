import { describe, expect, it } from 'vitest';
import { seaLookFor } from '../seaLook';
import { foamStepShows, haloAlphaAt, sprayVelocities, tideAt, TIDE_SECONDS } from '../surfPixels';

describe('seaLookFor', () => {
  it('is the normal sea when none was chosen', () => {
    expect(seaLookFor(undefined)).toBe(seaLookFor('normal'));
  });

  it('treats open water like a calm sea', () => {
    expect(seaLookFor('open')).toBe(seaLookFor('calm'));
  });

  it('gets busier and faster from calm to stormy', () => {
    const calm = seaLookFor('calm');
    const normal = seaLookFor('normal');
    const stormy = seaLookFor('stormy');
    expect(calm.ripples).toBeLessThan(normal.ripples);
    expect(normal.ripples).toBeLessThan(stormy.ripples);
    expect(calm.rippleWait).toBeGreaterThan(normal.rippleWait);
    expect(normal.rippleWait).toBeGreaterThan(stormy.rippleWait);
    expect(calm.surfPeriod).toBeGreaterThan(stormy.surfPeriod);
    expect(calm.surfSpeed).toBeLessThan(stormy.surfSpeed);
  });

  it('has white-caps only in a stormy sea, and a palette of its own for each look', () => {
    expect(seaLookFor('calm').whitecaps).toBe(0);
    expect(seaLookFor('normal').whitecaps).toBe(0);
    expect(seaLookFor('stormy').whitecaps).toBeGreaterThan(0);
    const colours = ['calm', 'normal', 'stormy'].map((s) => seaLookFor(s as 'calm').palette.depthMap[3]);
    expect(new Set(colours).size).toBe(3);
  });
});

describe('the tide', () => {
  it('moves slowly between -1 and 1 and comes round again', () => {
    expect(tideAt(0)).toBeCloseTo(0);
    expect(tideAt(TIDE_SECONDS / 4)).toBeCloseTo(1);
    expect(tideAt((TIDE_SECONDS * 3) / 4)).toBeCloseTo(-1);
    expect(tideAt(TIDE_SECONDS)).toBeCloseTo(0);
  });

  it('thins the shallows and the foam at low water', () => {
    expect(haloAlphaAt(-1)).toBeLessThan(haloAlphaAt(1));
    expect(haloAlphaAt(1)).toBeCloseTo(1);
    expect(foamStepShows(4, 1)).toBe(true);
    expect(foamStepShows(4, -1)).toBe(false);
    expect(foamStepShows(3, -1)).toBe(true);
    expect(foamStepShows(0, 1)).toBe(false);
    expect(foamStepShows(5, 1)).toBe(false);
  });
});

describe('sprayVelocities', () => {
  it('makes a speck for every two rolls', () => {
    expect(sprayVelocities([1, 0], [0.5, 0.5, 0.2, 0.9, 0.1, 0.1])).toHaveLength(3);
  });

  it('throws spray back against the wave and out to the sides', () => {
    // A wave travelling east: spray goes west (negative x), and up or down for the sides.
    const [middle, left, right] = sprayVelocities([1, 0], [0.5, 0.5, 0.5, 0, 0.5, 1]);
    expect(middle.dx).toBeLessThan(0);
    expect(middle.dy).toBeCloseTo(0);
    expect(left.dy).toBeLessThan(0);
    expect(right.dy).toBeGreaterThan(0);
    // A wave travelling south: spray goes north.
    const [south] = sprayVelocities([0, 1], [0.5, 0.5]);
    expect(south.dy).toBeLessThan(0);
    expect(south.dx).toBeCloseTo(0);
  });
});
