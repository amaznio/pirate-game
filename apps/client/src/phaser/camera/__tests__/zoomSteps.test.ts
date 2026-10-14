import { describe, expect, it } from 'vitest';
import { MAX_ART_SCALE, ZOOM_OUT_SCALES, allowedSteps, cameraSteps, snapToStep, stepFrom, zoomSteps } from '../zoomSteps';

describe('zoomSteps', () => {
  it('are whole numbers of screen pixels per art pixel, or a whole fraction when zooming out', () => {
    for (const scale of zoomSteps(1)) {
      const whole = Math.abs(scale - Math.round(scale)) < 1e-9;
      const fraction = Math.abs(1 / scale - Math.round(1 / scale)) < 1e-9;
      expect(whole || fraction, `${scale}`).toBe(true);
    }
    expect(zoomSteps(1)).toEqual([...zoomSteps(1)].sort((a, b) => a - b));
  });

  it('are the usual steps on an ordinary screen', () => {
    expect(zoomSteps(1)).toEqual([1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3]);
  });

  it('on a sharper screen stay whole device pixels and still reach the same on-screen size', () => {
    // A canvas drawn in device pixels: 6 whole steps at 2x reach 3 CSS pixels per art pixel.
    expect(zoomSteps(2)).toEqual([...ZOOM_OUT_SCALES, 1, 2, 3, 4, 5, 6]);
    expect(zoomSteps(2).at(-1)! / 2).toBe(MAX_ART_SCALE);
    // Between whole ratios the biggest step rounds up, so the art is never smaller than asked.
    expect(zoomSteps(1.5).at(-1)).toBe(5);
    for (const ratio of [1, 1.25, 1.5, 2, 3]) {
      expect(zoomSteps(ratio).at(-1)! / ratio).toBeGreaterThanOrEqual(MAX_ART_SCALE - 1e-9);
    }
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

  it('leaves a big window several steps to choose from, not just the one that fills it', () => {
    // A window of 2000 px needs a zoom of 1.3 to fill a 1536 px padded board, which
    // would leave only the step at 2. Allowing the board to shrink to 40% leaves 1, 2 and 3.
    expect(allowedSteps(steps, 1.3 * 0.4, 3)).toEqual([1, 2, 3]);
    // A phone, far smaller than the board, can zoom right out.
    expect(allowedSteps(steps, 0.25 * 0.4, 3)).toEqual([1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3]);
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

describe('cameraSteps', () => {
  /** The zooms a canvas of this size allows, for a padded board of 1536 px. */
  const forWindow = (width: number, height: number, pixelRatio = 1) =>
    cameraSteps({
      pixelRatio,
      coverFit: Math.max(width, height) >= 0 ? Math.max(width / 1536, height / 1536) : 0,
      containFit: Math.min(width / 1536, height / 1536),
      minBoardShare: 0.4,
    });

  it('lets the whole board be shown on a phone held upright', () => {
    const steps = forWindow(390, 844);
    // At the smallest step the padded board (1536 world px) fits in the 390 px width.
    expect(steps[0]! * 1536).toBeLessThanOrEqual(390 + 1e-6);
  });

  it('lets the whole board be shown on a phone on its side, which the old floor did not', () => {
    // 800 x 360: the old smallest step, 1/4, would show a 384 px board in a 360 px height.
    const steps = forWindow(800, 360);
    expect(steps[0]! * 1536).toBeLessThanOrEqual(360 + 1e-6);
    expect(steps).toContain(1 / 6);
  });

  it('shows the whole board on a window smaller still, down to the smallest step', () => {
    expect(forWindow(260, 260)[0]).toBe(1 / 6);
  });

  it('keeps a big window to a few steps, as before', () => {
    expect(forWindow(2000, 1200)).toEqual([1 / 2, 1, 2, 3]);
  });

  it('is never empty and stays in order', () => {
    for (const [w, h] of [[100, 100], [390, 844], [1280, 720], [3840, 2160], [400, 300]] as const) {
      for (const ratio of [1, 1.5, 2]) {
        const steps = forWindow(w, h, ratio);
        expect(steps.length).toBeGreaterThan(0);
        expect(steps).toEqual([...steps].sort((a, b) => a - b));
      }
    }
  });

  it('on a sharper screen counts the canvas in device pixels', () => {
    // A 1280 x 720 CSS window at 2x is a 2560 x 1440 canvas.
    const steps = forWindow(2560, 1440, 2);
    expect(steps.at(-1)).toBe(6);
    expect(steps.every((zoom) => Math.abs(zoom - Math.round(zoom)) < 1e-9 || Math.abs(1 / zoom - Math.round(1 / zoom)) < 1e-9)).toBe(true);
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
