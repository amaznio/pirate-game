import { describe, expect, it } from 'vitest';
import { SCREEN_SCALES, allowedSteps, snapToStep, stepFrom, zoomSteps } from '../zoomSteps';

describe('zoomSteps', () => {
  it('are whole numbers of screen pixels per art pixel, or a whole fraction when zooming out', () => {
    for (const scale of SCREEN_SCALES) {
      const whole = Math.abs(scale - Math.round(scale)) < 1e-9;
      const fraction = Math.abs(1 / scale - Math.round(1 / scale)) < 1e-9;
      expect(whole || fraction, `${scale}`).toBe(true);
    }
    expect(SCREEN_SCALES).toEqual([...SCREEN_SCALES].sort((a, b) => a - b));
  });

  it('are divided by the pixel ratio so a sharper screen still gets whole device pixels', () => {
    expect(zoomSteps(2)).toEqual(SCREEN_SCALES.map((scale) => scale / 2));
    expect(zoomSteps(1)).toEqual([...SCREEN_SCALES]);
  });
});

describe('allowedSteps', () => {
  const steps = zoomSteps(1);

  it('starts at the first step that still fills the screen', () => {
    // The board needs a zoom of at least 0.4: 1/4 and 1/3 would leave empty space.
    expect(allowedSteps(steps, 0.4, 3)[0]).toBe(1 / 2);
    expect(allowedSteps(steps, 0.25, 3)[0]).toBe(1 / 4);
    expect(allowedSteps(steps, 0.9, 3)[0]).toBe(1);
  });

  it('stops at the biggest zoom allowed', () => {
    const allowed = allowedSteps(steps, 0.25, 2.5);
    expect(allowed[allowed.length - 1]).toBe(2);
  });

  it('is never empty, even when no step fills the screen', () => {
    expect(allowedSteps(steps, 5, 6)).toEqual([3]);
    expect(allowedSteps(steps, 1.5, 1.8)).toEqual([2]);
  });
});

describe('snapToStep and stepFrom', () => {
  const steps = [1 / 2, 1, 2, 3];

  it('snaps to the nearest step in proportion', () => {
    expect(snapToStep(1.3, steps)).toBe(1);
    expect(snapToStep(1.5, steps)).toBe(2);
    expect(snapToStep(0.6, steps)).toBe(1 / 2);
    expect(snapToStep(100, steps)).toBe(3);
    expect(snapToStep(0.01, steps)).toBe(1 / 2);
  });

  it('moves one step at a time and stops at the ends', () => {
    expect(stepFrom(1, steps, 1)).toBe(2);
    expect(stepFrom(1, steps, -1)).toBe(1 / 2);
    expect(stepFrom(3, steps, 1)).toBe(3);
    expect(stepFrom(1 / 2, steps, -1)).toBe(1 / 2);
    // From a zoom between steps it counts from the nearest one.
    expect(stepFrom(1.3, steps, 1)).toBe(2);
  });
});
