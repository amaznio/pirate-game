/**
 * Zoom levels that keep pixel art crisp. Art drawn at a fractional zoom puts
 * some art pixels on more screen pixels than others, which shimmers when the
 * camera moves and lets a neighbouring sprite show along an edge. At a whole
 * number of screen pixels per art pixel (or a whole fraction, 1/2, 1/3, 1/4)
 * every pixel is the same size.
 */

/** Screen pixels per world pixel that stay crisp: whole numbers, and 1/n for zooming out. */
export const SCREEN_SCALES: readonly number[] = [1 / 4, 1 / 3, 1 / 2, 1, 2, 3];

/** All the zoom levels, smallest first, for a screen with `pixelRatio` device pixels per CSS pixel. */
export function zoomSteps(pixelRatio = 1): number[] {
  return SCREEN_SCALES.map((scale) => scale / pixelRatio);
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
