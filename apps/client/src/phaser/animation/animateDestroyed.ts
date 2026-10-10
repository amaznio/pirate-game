import Phaser from 'phaser';

/**
 * A destroyed ship breaks apart (if its art has a broken hull) and then sinks
 * and fades.
 */
export function animateDestroyed(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
): Promise<void> {
  (view.getData('onDestroyed') as (() => void) | undefined)?.();
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: view,
      alpha: 0,
      y: view.y + 20,
      rotation: view.rotation + 0.6,
      scale: 0.7,
      duration: 700,
      ease: 'Sine.easeIn',
      onComplete: () => resolve(),
    });
  });
}
