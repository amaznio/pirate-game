import Phaser from 'phaser';
import {
  RIPPLE_FRAMES,
  RIPPLE_GLYPHS,
  chooseGlyph,
  pictureSize,
  ripplePixel,
  rippleFrameAt,
  type RippleAxis,
  type RippleGlyph,
} from '../assets/ripplePixels';
import { seededRandom, type SeaPalette } from '../assets/seaPixels';

/** Screen pixels per art pixel, as everywhere in the sea. */
const SCALE = 2;

/** How many ripples there can be at once, over the area they are spread across. */
const RIPPLES = 420;

/** A ripple waits this long (milliseconds) between lives, at least and at most. */
const WAIT_MIN = 800;
const WAIT_MAX = 6500;

const rippleKey = (glyph: RippleGlyph, axis: RippleAxis, frame: number): string =>
  `ripple-${glyph}-${axis}-${frame}`;

/** Paints every frame of every glyph for one axis onto small canvas textures. */
function ensureRippleTextures(scene: Phaser.Scene, axis: RippleAxis, palette: SeaPalette): void {
  for (const glyph of RIPPLE_GLYPHS) {
    const { width, height } = pictureSize(glyph, axis);
    for (let frame = 0; frame < RIPPLE_FRAMES; frame += 1) {
      const key = rippleKey(glyph, axis, frame);
      if (scene.textures.exists(key)) {
        continue;
      }
      const canvas = scene.textures.createCanvas(key, width, height);
      const context = canvas?.getContext();
      if (!canvas || !context) {
        continue;
      }
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const pixel = ripplePixel(glyph, frame, axis, x, y);
          if (pixel) {
            context.fillStyle = pixel === 'light' ? palette.rippleLight : palette.rippleShade;
            context.fillRect(x, y, 1, 1);
          }
        }
      }
      canvas.refresh();
      canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export interface RippleArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Ripple {
  readonly sprite: Phaser.GameObjects.Image;
  glyph: RippleGlyph;
  /** Milliseconds into its life, or counting down to the next one (negative). */
  age: number;
}

/**
 * The surface of the sea as a scatter of small ripples. Each one grows, holds,
 * shrinks and vanishes where it is, then turns up somewhere else after a random
 * wait, so nothing slides and no shape stays: the water seems to be alive rather
 * than painted. They lie across the swell, which is all that shows its
 * direction. Few at a time, so it stays calm.
 */
export class RippleField {
  private readonly ripples: Ripple[] = [];
  private readonly random: () => number;

  constructor(
    scene: Phaser.Scene,
    private readonly area: RippleArea,
    private readonly axis: RippleAxis,
    seed: number,
    palette: SeaPalette,
  ) {
    ensureRippleTextures(scene, axis, palette);
    this.random = seededRandom(seed ^ 0x1f83d9ab);
    for (let i = 0; i < RIPPLES; i += 1) {
      const [x, y] = this.place();
      const sprite = scene.add
        .image(x, y, rippleKey('dash', axis, 0))
        .setDepth(0.05)
        .setScale(SCALE)
        .setVisible(false);
      // Start at random points in a life, so they are not all in step.
      this.ripples.push({
        sprite,
        glyph: 'dash',
        age: -this.random() * WAIT_MAX,
      });
    }
  }

  /** A random spot in the area, on a whole art pixel. */
  private place(): [number, number] {
    return [
      Math.round((this.area.left + this.random() * this.area.width) / SCALE) * SCALE,
      Math.round((this.area.top + this.random() * this.area.height) / SCALE) * SCALE,
    ];
  }

  /** Moves every ripple on by `deltaMs`. */
  update(deltaMs: number): void {
    for (const ripple of this.ripples) {
      ripple.age += deltaMs;
      if (ripple.age < 0) {
        continue;
      }
      const frame = rippleFrameAt(ripple.age);
      if (frame < 0) {
        // Over: hide it and wait to turn up somewhere else.
        ripple.sprite.setVisible(false);
        ripple.age = -(WAIT_MIN + this.random() * (WAIT_MAX - WAIT_MIN));
        ripple.glyph = chooseGlyph(this.random());
        // A new place for its next life, chosen now while it is out of sight.
        ripple.sprite.setPosition(...this.place());
        continue;
      }
      ripple.sprite.setTexture(rippleKey(ripple.glyph, this.axis, frame)).setVisible(true);
    }
  }
}
