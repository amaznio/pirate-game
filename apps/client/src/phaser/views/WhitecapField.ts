import Phaser from 'phaser';
import type { RippleArea } from './RippleField';
import { paletteTag, seededRandom, type SeaPalette } from '../assets/seaPixels';
import type { RippleAxis } from '../assets/ripplePixels';

/** Screen pixels per art pixel, as everywhere in the sea. */
const SCALE = 2;

/** A fleck of white lasts this long, and waits this long (milliseconds) before it comes again. */
const LIFE_MS = 700;
const WAIT_MIN = 600;
const WAIT_MAX = 3200;

const capKey = (palette: SeaPalette, axis: RippleAxis): string =>
  `whitecap-${paletteTag(palette)}-${axis}`;

/** A broken white fleck, six art pixels long and two thick, lying across the swell. */
function ensureCapTexture(scene: Phaser.Scene, axis: RippleAxis, palette: SeaPalette): void {
  const key = capKey(palette, axis);
  if (scene.textures.exists(key)) {
    return;
  }
  const long = 6;
  const width = axis === 'x' ? long : 2;
  const height = axis === 'x' ? 2 : long;
  const canvas = scene.textures.createCanvas(key, width, height);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  // The top row is white with a gap; the row under it is a lighter blue shadow.
  const white = [1, 1, 0, 1, 1, 1];
  const shade = [0, 1, 1, 1, 0, 0];
  for (let i = 0; i < long; i += 1) {
    const [x, y] = axis === 'x' ? [i, 0] : [0, i];
    const [sx, sy] = axis === 'x' ? [i, 1] : [1, i];
    if (white[i]) {
      context.fillStyle = palette.foam;
      context.fillRect(x, y, 1, 1);
    }
    if (shade[i]) {
      context.fillStyle = palette.rippleLight;
      context.fillRect(sx, sy, 1, 1);
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

interface Cap {
  readonly sprite: Phaser.GameObjects.Image;
  /** Milliseconds into its life, or counting down to the next one (negative). */
  age: number;
}

/**
 * Flecks of white on the crests of a rough sea: each one flares, holds for a
 * moment and is gone, then turns up somewhere else. Quicker and brighter than
 * the ripples, and only in stormy water.
 */
export class WhitecapField {
  private readonly caps: Cap[] = [];
  private readonly random: () => number;

  constructor(
    scene: Phaser.Scene,
    private readonly area: RippleArea,
    axis: RippleAxis,
    seed: number,
    palette: SeaPalette,
    count: number,
  ) {
    ensureCapTexture(scene, axis, palette);
    this.random = seededRandom(seed ^ 0x6a09e667);
    for (let i = 0; i < count; i += 1) {
      const sprite = scene.add
        .image(0, 0, capKey(palette, axis))
        .setDepth(0.055)
        .setScale(SCALE)
        .setVisible(false);
      this.caps.push({ sprite, age: -this.random() * WAIT_MAX });
    }
  }

  private place(): [number, number] {
    return [
      Math.round((this.area.left + this.random() * this.area.width) / SCALE) * SCALE,
      Math.round((this.area.top + this.random() * this.area.height) / SCALE) * SCALE,
    ];
  }

  update(deltaMs: number): void {
    for (const cap of this.caps) {
      cap.age += deltaMs;
      if (cap.age < 0) {
        continue;
      }
      if (cap.age >= LIFE_MS) {
        cap.sprite.setVisible(false);
        cap.age = -(WAIT_MIN + this.random() * (WAIT_MAX - WAIT_MIN));
        cap.sprite.setPosition(...this.place());
        continue;
      }
      // Bright for the middle of its life, faint at either end.
      const t = cap.age / LIFE_MS;
      cap.sprite.setVisible(true).setAlpha(t < 0.2 ? t / 0.2 : t > 0.7 ? (1 - t) / 0.3 : 1);
    }
  }
}
