import Phaser from 'phaser';
import type { Obstacle } from '@pirate/game-core/domain/Board';
import {
  foamStep,
  foamStepShows,
  haloAlphaAt,
  sprayVelocities,
  tideAt,
  waveArrival,
} from '../assets/surfPixels';
import { surfFoamKey, surfHaloKey } from '../assets/surfTextures';
import type { SeaLook } from '../assets/seaLook';
import { stonePlacement } from './ObstacleView';

/** A speck of spray is two art pixels across and lives this long (milliseconds). */
const SPECK_SIZE = 4;
const SPECK_LIFE_MS = 450;

interface Surf {
  readonly stone: number;
  readonly halo: Phaser.GameObjects.Image;
  readonly foam: Phaser.GameObjects.Image;
  readonly x: number;
  readonly y: number;
  readonly arrival: number;
  /** The step of the wash last shown, to notice a new wave arriving. */
  step: number;
}

interface Speck {
  readonly sprite: Phaser.GameObjects.Rectangle;
  readonly from: { readonly x: number; readonly y: number };
  readonly dx: number;
  readonly dy: number;
  age: number;
}

/**
 * Shallows and surf round every rock: a pale halo that sits there and slowly
 * breathes with the tide, and a ring of foam that washes out from the stone and
 * fades, over and over. The waves come in the swell direction, so each rock gets
 * its wash a little after the one before it along that way, as if one wave were
 * rolling over them in turn; as a wave breaks, a few specks of spray fly up. At
 * low tide the outer ring of foam is lost and the shallows thin out.
 */
export class SurfView {
  private readonly surfs: Surf[] = [];
  private readonly specks: Speck[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    obstacles: Iterable<Obstacle>,
    private readonly direction: readonly [number, number],
    private readonly look: Pick<SeaLook, 'surfPeriod' | 'surfSpeed' | 'spray'>,
  ) {
    for (const obstacle of obstacles) {
      const place = stonePlacement(obstacle);
      const halo = scene.add
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
        halo,
        foam,
        x: place.x,
        y: place.y,
        arrival: waveArrival(place.x, place.y, direction, look.surfSpeed),
        step: 0,
      });
    }
  }

  /** Shows each rock's foam at the right step for `timeMs`, and flies the spray on by `deltaMs`. */
  update(timeMs: number, deltaMs = 0): void {
    const seconds = timeMs / 1000;
    const tide = tideAt(seconds);
    const haloAlpha = haloAlphaAt(tide);
    for (const surf of this.surfs) {
      const step = foamStep(seconds, surf.arrival, this.look.surfPeriod);
      surf.halo.setAlpha(haloAlpha);
      if (foamStepShows(step, tide)) {
        surf.foam.setTexture(surfFoamKey(surf.stone, step)).setVisible(true);
      } else {
        surf.foam.setVisible(false);
      }
      // The wave breaks as the first ring appears.
      if (step === 1 && surf.step !== 1) {
        this.throwSpray(surf);
      }
      surf.step = step;
    }
    this.moveSpray(deltaMs);
  }

  /** Specks thrown back from the side of the stone the wave hits, and out to both sides. */
  private throwSpray(surf: Surf): void {
    const rolls = Array.from({ length: this.look.spray * 2 }, () => Math.random());
    const from = {
      x: surf.x - this.direction[0] * 14,
      y: surf.y - this.direction[1] * 14,
    };
    for (const { dx, dy } of sprayVelocities(this.direction, rolls)) {
      const sprite = this.scene.add
        .rectangle(from.x, from.y, SPECK_SIZE, SPECK_SIZE, 0xf6fcff)
        .setDepth(9.7);
      this.specks.push({ sprite, from, dx, dy, age: 0 });
    }
  }

  private moveSpray(deltaMs: number): void {
    for (let i = this.specks.length - 1; i >= 0; i -= 1) {
      const speck = this.specks[i];
      speck.age += deltaMs;
      const t = speck.age / SPECK_LIFE_MS;
      if (t >= 1) {
        speck.sprite.destroy();
        this.specks.splice(i, 1);
        continue;
      }
      // On whole art pixels, thrown out quickly and slowing as it falls back.
      const reach = 1 - (1 - t) * (1 - t);
      speck.sprite.setPosition(
        Math.round((speck.from.x + speck.dx * reach) / 2) * 2,
        Math.round((speck.from.y + speck.dy * reach) / 2) * 2,
      );
      speck.sprite.setAlpha(1 - t * t);
    }
  }
}
