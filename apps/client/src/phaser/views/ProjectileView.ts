import Phaser from 'phaser';
import type { Position } from '@pirate/game-core/domain/Position';
import { AssetKeys, EffectFrames } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

export function createProjectileView(
  scene: Phaser.Scene,
  from: Position,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(from);
  return scene.add
    .image(x, y, AssetKeys.ships, EffectFrames.cannonball)
    .setDepth(60)
    .setScale(1.6);
}
