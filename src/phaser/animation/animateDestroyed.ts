import Phaser from 'phaser';

/** Simple sinking/fade placeholder for a destroyed ship. */
export function animateDestroyed(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
): Promise<void> {
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
