/**
 * Device pixels per CSS pixel (1 on an ordinary screen, 2 on a sharp one). The
 * board's canvas is drawn in device pixels and shown at CSS size, so it is crisp
 * instead of a small canvas stretched by the browser. Sizes that are meant to
 * look the same on every screen (the ship avatars, the edge arrows) are
 * multiplied by this.
 */
export function pixelRatio(): number {
  return Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
}
