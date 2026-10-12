import Phaser from 'phaser';
import { playFx, usesPixelEffects } from './animateEffects';

/** Where the extra bursts go, as fractions of a cell from the ship's centre. */
const BURSTS: ReadonlyArray<{ dx: number; dy: number; delay: number; scale: number }> = [
  { dx: 0, dy: 0, delay: 0, scale: 5 },
  { dx: -18, dy: 10, delay: 140, scale: 3 },
  { dx: 16, dy: -12, delay: 260, scale: 3 },
];

/**
 * A destroyed ship breaks apart (if its art has a broken hull) and then sinks
 * and fades. With the pixel art, it also goes up in a big explosion with two
 * smaller blasts after it.
 */
export function animateDestroyed(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
): Promise<void> {
  (view.getData('onDestroyed') as (() => void) | undefined)?.();
  const blasts: Promise<void>[] = [];
  if (usesPixelEffects()) {
    const { x, y } = view;
    for (const burst of BURSTS) {
      blasts.push(
        new Promise<void>((done) => {
          scene.time.delayedCall(burst.delay, () => {
            void playFx(scene, 'explosion', x + burst.dx, y + burst.dy, {
              scale: burst.scale,
              frameMs: 90,
              depth: 80,
            }).then(done);
          });
        }),
      );
    }
  }
  const sinking = new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: view,
      alpha: 0,
      y: view.y + 20,
      rotation: view.rotation + 0.6,
      scale: 0.7,
      duration: 700,
      delay: usesPixelEffects() ? 200 : 0,
      ease: 'Sine.easeIn',
      onComplete: () => resolve(),
    });
  });
  return Promise.all([sinking, ...blasts]).then(() => undefined);
}
