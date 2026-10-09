import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';

/** Short muzzle flash at the firing ship. */
export function spawnMuzzleFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
): void {
  const flash = scene.add.image(x, y, AssetKeys.flash).setDepth(55);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.8,
    duration: 160,
    onComplete: () => flash.destroy(),
  });
}

/** Small grey puff shown when a queued shot had no cannonball to fire. */
export function spawnDryFire(
  scene: Phaser.Scene,
  x: number,
  y: number,
): void {
  const puff = scene.add.circle(x, y, 8, 0x9aa4ad, 0.5).setDepth(55);
  scene.tweens.add({
    targets: puff,
    scale: 1.8,
    alpha: 0,
    duration: 260,
    onComplete: () => puff.destroy(),
  });
}
