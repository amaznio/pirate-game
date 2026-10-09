import Phaser from 'phaser';
import type { Position } from '@pirate/game-core/domain/Position';
import { AssetKeys, EffectFrames } from '../assets/AssetKeys';
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

/** Explosion for a hit. */
export function spawnImpact(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  const burst = scene.add
    .image(x, y, AssetKeys.ships, EffectFrames.explosion)
    .setDepth(70)
    .setScale(0.8);
  scene.tweens.add({
    targets: burst,
    scale: 1.2,
    alpha: 0,
    duration: 320,
    onComplete: () => burst.destroy(),
  });
}

/** Water splash for a miss. */
export function spawnSplash(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  const splash = scene.add.circle(x, y, 10, 0xbfe3ef, 0.7).setDepth(70);
  scene.tweens.add({
    targets: splash,
    scale: 2,
    alpha: 0,
    duration: 400,
    onComplete: () => splash.destroy(),
  });
}
