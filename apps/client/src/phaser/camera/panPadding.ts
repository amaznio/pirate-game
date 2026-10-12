/**
 * How far past the board the camera may scroll along one axis. Enough to bring
 * any point of the board to the middle of the screen (half the visible size),
 * so a window wider or taller than the board can still be dragged every way,
 * never less than `minPad`, and never more than `maxPad`, which is how far the
 * sea really extends.
 */
export function panPadding(visibleSize: number, minPad: number, maxPad: number): number {
  return Math.min(maxPad, Math.max(minPad, visibleSize / 2));
}
