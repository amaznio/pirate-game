import Phaser from 'phaser';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import { positionsEqual } from '@pirate/game-core/domain/Position';
import { gridToWorld } from '../Grid';
import { headingToAngle } from '../views/ShipView';
import { nearestEquivalentAngle, tweenRotation, tweenTo } from './animateMovement';

type PushedEvent = Extract<GameEvent, { type: 'SHIP_PUSHED' }>;
type SpunEvent = Extract<GameEvent, { type: 'SHIP_SPUN' }>;

/** The wind carries the ship one cell, at an even pace so a row flows. */
export function animatePush(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  event: PushedEvent,
): Promise<void> {
  const { x, y } = gridToWorld(event.to);
  return tweenTo(scene, view, x, y, 170, 'Linear');
}

/** A whirlpool carries the ship round to the next cell, turning it as it goes. */
export function animateSpin(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  event: SpunEvent,
): Promise<void> {
  const turn = tweenRotation(
    scene,
    view,
    nearestEquivalentAngle(view.rotation, headingToAngle(event.toHeading)),
    360,
  );
  if (positionsEqual(event.from, event.to)) {
    return turn;
  }
  const { x, y } = gridToWorld(event.to);
  return Promise.all([tweenTo(scene, view, x, y, 360), turn]).then(() => undefined);
}
