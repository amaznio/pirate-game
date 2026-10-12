import Phaser from 'phaser';
import type { Direction } from '@pirate/game-core/domain/Direction';
import { vectorFor } from '@pirate/game-core/domain/Direction';
import { FX_FRAMES, ScallywagKeys, fxFrameName } from '../assets/scallywag';
import { gridToWorld } from '../Grid';
import { currentArtStyle } from '../../presentation/artStyle';
import type { Position } from '@pirate/game-core/domain/Position';

/** Whether effects are drawn from the pixel-art frames. */
export const usesPixelEffects = (): boolean => currentArtStyle() === 'scallywag';

/** How far past the ship's centre a cannon's smoke appears, along the shot. */
const MUZZLE_REACH = 30;

/**
 * Plays a four-frame effect (a smoke puff or an explosion) where it is, one
 * frame at a time, and removes it. The pixels stay crisp: the scale is a whole
 * number and the frames are swapped, not blended.
 */
export function playFx(
  scene: Phaser.Scene,
  kind: 'puff' | 'explosion',
  x: number,
  y: number,
  options: { scale?: number; frameMs?: number; depth?: number; tint?: number } = {},
): Promise<void> {
  const image = scene.add
    .image(x, y, ScallywagKeys.ships, fxFrameName(kind, 0))
    .setDepth(options.depth ?? 70)
    .setScale(options.scale ?? 3);
  if (options.tint !== undefined) {
    image.setTint(options.tint);
  }
  const frameMs = options.frameMs ?? 70;

  return new Promise((resolve) => {
    let frame = 0;
    scene.time.addEvent({
      delay: frameMs,
      repeat: FX_FRAMES - 1,
      callback: () => {
        frame += 1;
        if (frame >= FX_FRAMES) {
          image.destroy();
          resolve();
        } else {
          image.setFrame(fxFrameName(kind, frame));
        }
      },
    });
  });
}

/** Smoke from a cannon's mouth: a puff just outside the hull on the firing side. */
export function spawnPixelMuzzle(
  scene: Phaser.Scene,
  from: Position,
  direction: Direction,
): void {
  const { x, y } = gridToWorld(from);
  const way = vectorFor(direction);
  void playFx(scene, 'puff', x + way.x * MUZZLE_REACH, y + way.y * MUZZLE_REACH, {
    scale: 2,
    frameMs: 80,
    depth: 55,
  });
  // The flash of the shot itself, brief and in front of the smoke.
  void playFx(scene, 'explosion', x + way.x * (MUZZLE_REACH - 4), y + way.y * (MUZZLE_REACH - 4), {
    scale: 1,
    frameMs: 50,
    depth: 56,
  });
}

/** A hit: an explosion, a cell wide. */
export function spawnPixelImpact(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  void playFx(scene, 'explosion', x, y, { scale: 4, frameMs: 80, depth: 70 });
}

/** A miss: a pale splash. */
export function spawnPixelSplash(scene: Phaser.Scene, to: Position): void {
  const { x, y } = gridToWorld(to);
  void playFx(scene, 'puff', x, y, { scale: 3, frameMs: 80, depth: 70, tint: 0xbfe8ff });
}
