import Phaser from 'phaser';
import {
  HULL_LAYOUT,
  ScallywagKeys,
  WAKE_FRAMES,
  wakeFrameName,
  type HullSize,
} from '../assets/scallywag';

/** How long each of the wake's six frames shows. */
const FRAME_MS = 90;

/**
 * A wake trailing behind the hull on each side while the ship sails: the sheet's six
 * frames played over and over under the hull, mirrored for the other side, and
 * removed when the move ends. The ship container faces south, so the wake is
 * built in the ship's own space and turns with it. Does nothing for a ship that
 * is not built from the Scallywag parts.
 */
export function startWake(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  durationMs: number,
): void {
  const stop = attachWake(scene, view);
  scene.time.delayedCall(durationMs, stop);
}

/**
 * Puts the wake under a ship and returns the function that takes it away again.
 * (`startWake` is this for a set time; the art lab keeps one on for good.)
 */
export function attachWake(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
): () => void {
  const size = view.getData('size') as HullSize | undefined;
  if (!size) {
    return () => undefined;
  }
  const layout = HULL_LAYOUT[size];

  // In the sheet the lines run along the hull and flare outward at the bottom of
  // the frame, which is how a wake looks at its far end. The ship faces south, so
  // the picture is flipped upside down: the lines hug the hull and the flare
  // trails off behind the stern. The frame's top (the flare) sits at the stern.
  const sternFromCentre = layout.h * layout.centreY;
  const centreY = 32 - sternFromCentre;
  const sideX = layout.w / 2 - 2;

  const waves = [-1, 1].map((side) =>
    scene.add
      .image(side * sideX, centreY, ScallywagKeys.ships, wakeFrameName(0))
      .setFlipX(side === 1)
      .setFlipY(true)
      .setAlpha(0.9),
  );
  view.addAt(waves, 0);

  let frame = 0;
  const timer = scene.time.addEvent({
    delay: FRAME_MS,
    loop: true,
    callback: () => {
      frame = (frame + 1) % WAKE_FRAMES;
      for (const wave of waves) {
        wave.setFrame(wakeFrameName(frame));
      }
    },
  });

  return () => {
    timer.remove();
    for (const wave of waves) {
      wave.destroy();
    }
  };
}
