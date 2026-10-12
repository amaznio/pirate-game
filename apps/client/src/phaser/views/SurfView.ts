import Phaser from 'phaser';
import type { Obstacle } from '@pirate/game-core/domain/Board';
import { foamStep, waveArrival } from '../assets/surfPixels';
import { surfFoamKey, surfHaloKey } from '../assets/surfTextures';
import { stonePlacement } from './ObstacleView';

/** One wash of foam takes this long, in seconds, from the wave arriving to the water drawing back. */
const PERIOD = 6;

/** How fast a wave runs across the board, in world pixels a second (a cell a second). */
const WAVE_SPEED = 64;

interface Surf {
  readonly stone: number;
  readonly foam: Phaser.GameObjects.Image;
  readonly arrival: number;
}

/**
 * Shallows and surf round every rock: a pale halo that sits there, and a ring of
 * foam that washes out from the stone and fades, over and over. The waves come
 * in the swell direction, so each rock gets its wash a little after the one
 * before it along that way, as if one wave were rolling over them in turn.
 */
export class SurfView {
  private readonly surfs: Surf[] = [];

  constructor(
    scene: Phaser.Scene,
    obstacles: Iterable<Obstacle>,
    direction: readonly [number, number],
  ) {
    for (const obstacle of obstacles) {
      const place = stonePlacement(obstacle);
      scene.add
        .image(place.x, place.y, surfHaloKey(place.index))
        .setDepth(9.5)
        .setScale(place.scale)
        .setFlipX(place.flipX);
      const foam = scene.add
        .image(place.x, place.y, surfFoamKey(place.index, 1))
        .setDepth(9.6)
        .setScale(place.scale)
        .setFlipX(place.flipX)
        .setVisible(false);
      this.surfs.push({
        stone: place.index,
        foam,
        arrival: waveArrival(place.x, place.y, direction, WAVE_SPEED),
      });
    }
  }

  /** Shows each rock foam at the right step for `timeMs`. */
  update(timeMs: number): void {
    const seconds = timeMs / 1000;
    for (const surf of this.surfs) {
      const step = foamStep(seconds, surf.arrival, PERIOD);
      if (step >= 1 && step <= 4) {
        surf.foam.setTexture(surfFoamKey(surf.stone, step)).setVisible(true);
      } else {
        surf.foam.setVisible(false);
      }
    }
  }
}
