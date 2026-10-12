import Phaser from 'phaser';
import type { Position } from '@pirate/game-core/domain/Position';
import { currentArtStyle } from '../../presentation/artStyle';
import { AssetKeys, EffectFrames } from '../assets/AssetKeys';
import { PIXEL_BALL_KEY } from '../assets/pixelTerrain';
import { gridToWorld } from '../Grid';

export function createProjectileView(
  scene: Phaser.Scene,
  from: Position,
): Phaser.GameObjects.Image {
  const { x, y } = gridToWorld(from);
  if (currentArtStyle() === 'scallywag') {
    return scene.add.image(x, y, PIXEL_BALL_KEY).setDepth(60).setScale(3);
  }
  return scene.add
    .image(x, y, AssetKeys.ships, EffectFrames.cannonball)
    .setDepth(60)
    .setScale(1.6);
}
