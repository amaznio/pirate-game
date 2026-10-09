import Phaser from 'phaser';
import type { Position } from '../../game/domain/Position';
import { AssetKeys } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

export function createProjectileView(
  scene: Phaser.Scene,
  from: Position,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(from);
  return scene.add.image(x, y, AssetKeys.projectile).setDepth(60);
}
