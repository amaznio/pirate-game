import Phaser from 'phaser';
import type { Obstacle } from '../../game/domain/Board';
import { AssetKeys } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

export function createObstacleView(
  scene: Phaser.Scene,
  obstacle: Obstacle,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(obstacle.position);
  const key = obstacle.kind === 'rock' ? AssetKeys.rock : AssetKeys.island;
  return scene.add.image(x, y, key).setDepth(10);
}
