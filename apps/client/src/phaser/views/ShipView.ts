import Phaser from 'phaser';
import type { Ship } from '@pirate/game-core/domain/Ship';
import type { Direction } from '@pirate/game-core/domain/Direction';
import { AssetKeys, ShipFrames } from '../assets/AssetKeys';
import { HULL_LAYOUT, ScallywagKeys, hullFrameName, hullStateFor } from '../assets/scallywag';
import type { TeamStyle } from '../../presentation/teamStyle';
import { currentArtStyle } from '../../presentation/artStyle';
import { TILE_SIZE, gridToWorld } from '../Grid';
import { createScallywagShip, lookOf, setScallywagHull } from './scallywagShip';

/** Both the Kenney and the Scallywag ship art point SOUTH (bow at the bottom) at rotation 0. */
const HEADING_ANGLE: Record<Direction, number> = {
  NORTH: Math.PI,
  EAST: -Math.PI / 2,
  SOUTH: 0,
  WEST: Math.PI / 2,
};

/** Kenney ship art is 66x113, scaled to sit inside a 64px cell. */
const SHIP_SCALE = 0.55;

export function headingToAngle(heading: Direction): number {
  return HEADING_ANGLE[heading];
}

export interface ShipViewOptions {
  /** This is the local player's ship: it gets a white outline. */
  readonly isViewer?: boolean;
}

/** A ship wears the sails of its team. */
export function createShipView(
  scene: Phaser.Scene,
  ship: Ship,
  style: TeamStyle,
  options: ShipViewOptions = {},
): Phaser.GameObjects.Container {
  const { x, y } = gridToWorld(ship.position);

  if (currentArtStyle() === 'scallywag') {
    const cannons = ship.weapons.filter((mount) => mount.side === 'left').length;
    const container = createScallywagShip(
      scene,
      {
        look: lookOf(ship.shipTypeId),
        hullColour: style.hull,
        sailColour: style.sail,
        state: hullStateFor(ship.hp, ship.maxHp),
        cannons,
      },
      x,
      y,
      // Your own ship is outlined in white, every other in its team's colour.
      { outline: options.isViewer ? 0xffffff : style.color, showCell: true },
    );
    container.setDepth(20);
    container.setRotation(headingToAngle(ship.heading));
    return container;
  }

  const sprite = scene.add
    .image(0, 0, AssetKeys.ships, style.frame)
    .setScale(SHIP_SCALE);
  if (style.tint !== null) {
    sprite.setTint(style.tint);
  }
  const container = scene.add.container(x, y, [sprite]);
  container.setDepth(20);
  container.setRotation(headingToAngle(ship.heading));
  container.setData('sprite', sprite);
  return container;
}

/** Brings a ship's picture in line with its hull points (the damage step). */
export function setShipHull(
  container: Phaser.GameObjects.Container,
  hp: number,
  maxHp: number,
): void {
  if (currentArtStyle() === 'scallywag') {
    setScallywagHull(container, hullStateFor(hp, maxHp));
  }
}

/** A see-through copy of a ship's hull, for the plan preview's ghosts. */
export function createShipGhost(
  scene: Phaser.Scene,
  ship: Ship | undefined,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  if (currentArtStyle() === 'scallywag' && ship) {
    const look = lookOf(ship.shipTypeId);
    return scene.add
      .image(x, y, ScallywagKeys.ships, hullFrameName(look.size, 0, 'intact'))
      .setOrigin(0.5, HULL_LAYOUT[look.size].centreY);
  }
  return scene.add.image(x, y, AssetKeys.ships, ShipFrames.player).setScale(0.5);
}

/**
 * How far above a ship's centre its avatar floats, so the avatar clears the
 * hull whichever way the ship faces: half a cell for the old art, and for the
 * longer Scallywag hulls, the hull's extent along the screen's vertical.
 */
export function hudLift(ship: Ship): number {
  if (currentArtStyle() !== 'scallywag') {
    return TILE_SIZE * 0.5;
  }
  const layout = HULL_LAYOUT[lookOf(ship.shipTypeId).size];
  const vertical = ship.heading === 'NORTH' || ship.heading === 'SOUTH';
  const extent = vertical ? layout.h * Math.max(layout.centreY, 1 - layout.centreY) : layout.w / 2;
  return Math.max(TILE_SIZE * 0.5, extent) + 4;
}
