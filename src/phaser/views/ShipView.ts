import Phaser from 'phaser';
import type { Ship } from '../../game/domain/Ship';
import type { Direction } from '../../game/domain/Direction';
import { AssetKeys } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

/** Texture orientation: the placeholder art points EAST at rotation 0. */
const HEADING_ANGLE: Record<Direction, number> = {
  NORTH: -Math.PI / 2,
  EAST: 0,
  SOUTH: Math.PI / 2,
  WEST: Math.PI,
};

export function headingToAngle(heading: Direction): number {
  return HEADING_ANGLE[heading];
}

export function createShipView(
  scene: Phaser.Scene,
  ship: Ship,
): Phaser.GameObjects.Container {
  const { x, y } = gridToWorld(ship.position);
  const sprite = scene.add.image(
    0,
    0,
    ship.side === 'player' ? AssetKeys.shipPlayer : AssetKeys.shipEnemy,
  );
  const container = scene.add.container(x, y, [sprite]);
  container.setDepth(20);
  container.setRotation(headingToAngle(ship.heading));
  container.setData('sprite', sprite);
  return container;
}
