import Phaser from 'phaser';
import type { Obstacle } from '@pirate/game-core/domain/Board';
import { AssetKeys } from '../assets/AssetKeys';
import { TILE_SIZE, gridToWorld } from '../Grid';

/** A repeatable pseudo-random number in [0, 1) for a cell and a purpose. */
function noise(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Every rock is the same stone, but each cell turns, sizes and shades it a
 * little differently (always the same way for a given cell), so a ridge reads
 * as a run of different boulders instead of one tile repeated.
 */
export function createObstacleView(
  scene: Phaser.Scene,
  obstacle: Obstacle,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(obstacle.position);
  const cx = obstacle.position.x;
  const cy = obstacle.position.y;
  const shade = Math.round(205 + noise(cx, cy, 4) * 50);

  return scene.add
    .image(
      x + (noise(cx, cy, 2) - 0.5) * TILE_SIZE * 0.14,
      y + (noise(cx, cy, 3) - 0.5) * TILE_SIZE * 0.14,
      AssetKeys.rock,
    )
    .setDepth(10)
    .setRotation(noise(cx, cy, 1) * Math.PI * 2)
    .setScale(0.88 + noise(cx, cy, 5) * 0.3)
    .setFlipX(noise(cx, cy, 6) < 0.5)
    .setTint(Phaser.Display.Color.GetColor(shade, shade, shade));
}
