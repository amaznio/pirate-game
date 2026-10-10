import Phaser from 'phaser';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import { gridToWorld } from '../Grid';
import { headingToAngle } from '../views/ShipView';

type MovedEvent = Extract<GameEvent, { type: 'SHIP_MOVED' }>;
type TurnedEvent = Extract<GameEvent, { type: 'SHIP_TURNED' }>;

export function tweenTo(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  x: number,
  y: number,
  duration = 240,
  ease = 'Sine.easeInOut',
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      x,
      y,
      duration,
      ease,
      onComplete: () => resolve(),
    });
  });
}

export function tweenRotation(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  angle: number,
  duration = 200,
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      rotation: angle,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => resolve(),
    });
  });
}

export function animateMovement(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  event: MovedEvent,
): Promise<void> {
  const { x, y } = gridToWorld(event.to);
  return tweenTo(scene, view, x, y);
}

export function animateTurn(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  event: TurnedEvent,
): Promise<void> {
  return tweenRotation(scene, view, nearestEquivalentAngle(view.rotation, headingToAngle(event.to)));
}

/**
 * Returns the target angle adjusted by whole turns so the rotation tween takes
 * the short way (a 90-degree turn should never animate as 270 degrees the other
 * way).
 */
export function nearestEquivalentAngle(current: number, target: number): number {
  const twoPi = Math.PI * 2;
  let delta = (target - current + Math.PI) % twoPi;
  if (delta < 0) {
    delta += twoPi;
  }
  delta -= Math.PI;
  return current + delta;
}

export function animateBlocked(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
): Promise<void> {
  const originX = view.x;
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: view,
      x: originX + 4,
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        view.x = originX;
        resolve();
      },
    });
  });
}
