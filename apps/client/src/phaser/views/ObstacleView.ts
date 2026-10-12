import Phaser from 'phaser';
import type { Obstacle } from '@pirate/game-core/domain/Board';
import { currentArtStyle } from '../../presentation/artStyle';
import { AssetKeys } from '../assets/AssetKeys';
import {
  STONE_COUNT,
  ScallywagKeys,
  stoneFrameName,
  stoneScale,
} from '../assets/scallywag';
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
/**
 * A rock in the Scallywag art: one of the sheet's twelve stones, never rotated
 * (rotating pixel art smears it), scaled by a whole number so it stays crisp,
 * and nudged by whole art pixels. Ships are drawn at their own size (a sloop is
 * about 30 px wide), so stones are 3x, and the smallest 2x: a stone is then
 * about a ship's beam wide, well short of its length.
 */
function createStoneView(
  scene: Phaser.Scene,
  obstacle: Obstacle,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(obstacle.position);
  const cx = obstacle.position.x;
  const cy = obstacle.position.y;
  const index = Math.floor(noise(cx, cy, 7) * STONE_COUNT);
  const scale = stoneScale(index);
  const nudge = (salt: number): number => Math.round((noise(cx, cy, salt) - 0.5) * 6) * scale;

  return scene.add
    .image(x + nudge(8), y + nudge(9), ScallywagKeys.water, stoneFrameName(index))
    .setDepth(10)
    .setScale(scale)
    .setFlipX(noise(cx, cy, 6) < 0.5);
}

export function createObstacleView(
  scene: Phaser.Scene,
  obstacle: Obstacle,
): Phaser.GameObjects.Image {
  if (currentArtStyle() === 'scallywag') {
    return createStoneView(scene, obstacle);
  }
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
