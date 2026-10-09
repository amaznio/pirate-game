import Phaser from 'phaser';
import type { Ship } from '../../game/domain/Ship';
import type { Direction } from '../../game/domain/Direction';
import { AssetKeys, ShipFrames } from '../assets/AssetKeys';
import { gridToWorld } from '../Grid';

/** The Kenney ship art points SOUTH (bow at the bottom) at rotation 0. */
const HEADING_ANGLE: Record<Direction, number> = {
  NORTH: Math.PI,
  EAST: -Math.PI / 2,
  SOUTH: 0,
  WEST: Math.PI / 2,
};

/** Ship art is 66x113, scaled to sit inside a 64px cell. */
const SHIP_SCALE = 0.55;

export function headingToAngle(heading: Direction): number {
  return HEADING_ANGLE[heading];
}

export function createShipView(
  scene: Phaser.Scene,
  ship: Ship,
): Phaser.GameObjects.Container {
  const { x, y } = gridToWorld(ship.position);
  const sprite = scene.add
    .image(
      0,
      0,
      AssetKeys.ships,
      ship.side === 'player' ? ShipFrames.player : ShipFrames.enemy,
    )
    .setScale(SHIP_SCALE);
  const container = scene.add.container(x, y, [sprite]);
  container.setDepth(20);
  container.setRotation(headingToAngle(ship.heading));
  container.setData('sprite', sprite);
  return container;
}
