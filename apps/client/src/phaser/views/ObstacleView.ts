import Phaser from 'phaser';
import type { Obstacle } from '@pirate/game-core/domain/Board';
import { AssetKeys, TileFrames } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

export function createObstacleView(
  scene: Phaser.Scene,
  obstacle: Obstacle,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(obstacle.position);
  return scene.add.image(x, y, AssetKeys.tiles, TileFrames.rock).setDepth(10);
}
