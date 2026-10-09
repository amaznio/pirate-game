import Phaser from 'phaser';
import type { Position } from '../../game/domain/Position';
import { AssetKeys } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

export function tweenProjectile(
  scene: Phaser.Scene,
  projectile: Phaser.GameObjects.Image,
  to: Position,
): Promise<void> {
  const { x, y } = gridToWorld(to);
  const distance = Phaser.Math.Distance.Between(
    projectile.x,
    projectile.y,
    x,
    y,
  );
  const duration = Phaser.Math.Clamp(distance * 4, 140, 520);
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: projectile,
      x,
      y,
      duration,
      ease: 'Linear',
      onComplete: () => resolve(),
    });
  });
}

/** Explosion placeholder for a hit. */
export function spawnImpact(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  const burst = scene.add.image(x, y, AssetKeys.flash).setDepth(70);
  scene.tweens.add({
    targets: burst,
    scale: 2.2,
    alpha: 0,
    duration: 300,
    onComplete: () => burst.destroy(),
  });
}

/** Splash placeholder for a miss. */
export function spawnSplash(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  const splash = scene.add.image(x, y, AssetKeys.splash).setDepth(70);
  scene.tweens.add({
    targets: splash,
    scale: 1.8,
    alpha: 0,
    duration: 400,
    onComplete: () => splash.destroy(),
  });
}
