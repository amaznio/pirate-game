/**
 * Zoom levels that keep pixel art crisp. Art drawn at a fractional zoom puts
 * some art pixels on more screen pixels than others, which shimmers when the
 * camera moves and lets a neighbouring sprite show along an edge. At a whole
 * number of screen pixels per art pixel (or a whole fraction, 1/2, 1/3, 1/4)
 * every pixel is the same size.
 */

/** Zooming out, a whole fraction: every art pixel is the same size, and the board can be shown whole on a small window. */
export const ZOOM_OUT_SCALES: readonly number[] = [1 / 6, 1 / 4, 1 / 3, 1 / 2];

/** The most the art zooms in: this many CSS pixels per art pixel. */
export const MAX_ART_SCALE = 3;

/**
 * All the zoom levels, smallest first, for a canvas drawn in device pixels on a
 * screen with `pixelRatio` device pixels per CSS pixel (1 on an ordinary screen).
 * A zoom is device pixels per art pixel, so whole numbers are crisp; there are
 * enough of them to reach `MAX_ART_SCALE` CSS pixels per art pixel.
 */
export function zoomSteps(pixelRatio = 1): number[] {
  const whole = Math.max(1, Math.round(MAX_ART_SCALE * pixelRatio));
  return [...ZOOM_OUT_SCALES, ...Array.from({ length: whole }, (_, index) => index + 1)];
}

/**
 * The steps a camera may use: none smaller than `minZoom` (the board must still
 * fill the screen, so the smallest allowed step is the first one that does) and
 * none bigger than `maxZoom`. Never empty: when the screen is too big for any
 * step to fill it, the largest step is used.
 */
export function allowedSteps(steps: readonly number[], minZoom: number, maxZoom: number): number[] {
  const epsilon = 1e-6;
  const big = steps.filter((zoom) => zoom >= minZoom - epsilon);
  const usable = big.filter((zoom) => zoom <= maxZoom + epsilon);
  if (usable.length > 0) {
    return usable;
  }
  return [big.length > 0 ? big[0] : steps[steps.length - 1]];
}

/** The step nearest to `zoom` in proportion (halving and doubling are equally far). */
export function snapToStep(zoom: number, steps: readonly number[]): number {
  let best = steps[0];
  let bestDistance = Infinity;
  for (const step of steps) {
    const distance = Math.abs(Math.log(zoom / step));
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

/** The step one up (+1) or one down (-1) from `zoom`, or the same one at either end. */
export function stepFrom(zoom: number, steps: readonly number[], direction: 1 | -1): number {
  const index = steps.indexOf(snapToStep(zoom, steps));
  const next = Math.min(steps.length - 1, Math.max(0, index + direction));
  return steps[next];
}

/**
 * The steps a camera may use on a canvas of a given size. `coverFit` is the zoom
 * at which the padded board fills the canvas, `containFit` the zoom at which the
 * whole padded board still fits inside it.
 *
 * The board may not shrink to less than `minBoardShare` of the screen, so a big
 * window has a few steps to choose from. But a small or short window (a phone on
 * its side) must always be able to show the whole board, so the floor is also
 * lowered to the largest step that does.
 */
export function cameraSteps(options: {
  readonly pixelRatio: number;
  readonly coverFit: number;
  readonly containFit: number;
  readonly minBoardShare: number;
}): number[] {
  const epsilon = 1e-6;
  const steps = zoomSteps(options.pixelRatio);
  const wholeBoard = steps.filter((zoom) => zoom <= options.containFit + epsilon).pop();
  const shareFloor = options.coverFit * options.minBoardShare;
  const floor = wholeBoard === undefined ? shareFloor : Math.min(shareFloor, wholeBoard);
  return allowedSteps(steps, floor, steps[steps.length - 1]);
}
