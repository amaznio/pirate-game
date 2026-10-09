import Phaser from 'phaser';

/** Short muzzle flash at the firing ship. */
export function spawnMuzzleFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
): void {
  const flash = scene.add.circle(x, y, 6, 0xffd166, 0.9).setDepth(55);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 2,
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
