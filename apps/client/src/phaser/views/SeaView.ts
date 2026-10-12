import Phaser from 'phaser';
import {
  SEA_LAYER_SIZE,
  bandLayer,
  chopLayer,
  depthLayer,
  seededRandom,
  swellFor,
  swellLayer,
  paletteTag,
  type SeaPalette,
} from '../assets/seaPixels';
import { TILE_SIZE } from '../Grid';
import { currentSwellBands, type SeaMode } from '../../presentation/artStyle';
import { RippleField } from './RippleField';
import { WhitecapField } from './WhitecapField';
import { seaLookFor, type SeaLook } from '../assets/seaLook';
import { generateDepthLevels, levelsToRgba, type Point } from '../assets/seaDepth';

/** Screen pixels per art pixel in the sea. */
const SEA_SCALE = 2;

/**
 * How fast the moving layers drift, in art pixels a second. They all go the same
 * way (the chop a little faster than the swell, so they slide over each other
 * without crossing). The depth layer is the water itself and stays where it is.
 */
const SWELL_SPEED = 5;
const CHOP_SPEED = 6.5;
/** The soft bands move slowly: about a cell every seven seconds. */
const BAND_SPEED = 4.5;

const TWINKLES = 70;

/** What is on the board, in world pixels, so the depth of the water can follow it. */
export interface SeaFeatures {
  readonly board: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rocks: readonly Point[];
  /** The middle of each whirlpool. */
  readonly whirlpools: readonly Point[];
}

/** How far past the board (in cells) the depth map reaches; past that the sea is plain open water. */
const DEPTH_MARGIN_CELLS = 8;

export interface SeaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Drifting {
  readonly sprite: Phaser.GameObjects.TileSprite;
  readonly direction: readonly [number, number];
  readonly speed: number;
  x: number;
  y: number;
}

function ensureLayer(
  scene: Phaser.Scene,
  key: string,
  build: () => Uint8ClampedArray,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const canvas = scene.textures.createCanvas(key, SEA_LAYER_SIZE, SEA_LAYER_SIZE);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  const image = context.createImageData(SEA_LAYER_SIZE, SEA_LAYER_SIZE);
  image.data.set(build());
  context.putImageData(image, 0, 0);
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** A tiny plus-shaped glint, one bright pixel in the middle. */
function ensureGlint(scene: Phaser.Scene, palette: SeaPalette): void {
  const key = `sea-glint-${paletteTag(palette)}`;
  if (scene.textures.exists(key)) {
    return;
  }
  const canvas = scene.textures.createCanvas(key, 3, 3);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  context.fillStyle = palette.glint;
  context.fillRect(1, 0, 1, 3);
  context.fillRect(0, 1, 3, 1);
  context.fillStyle = palette.foam;
  context.fillRect(1, 1, 1, 1);
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * The sea in the pixel-art style. The water is in patches of depth that stay put.
 * In `ripples` mode (the default) a passing swell is a few broad, soft bands of
 * lighter and darker water drifting slowly, and the surface is a scatter of
 * small ripples that grow and fade in place (`RippleField`), with a few glints:
 * nothing is a thin line and nothing slides. In `lines` mode (kept to compare)
 * the swell and the chop are long lines drifting the same way, at right angles
 * to it. The layers do not line up with one another or with the cells, so the
 * pattern does not repeat the way a single small tile does. Layers move in
 * whole art pixels so the pixels stay crisp.
 *
 * The seed (made from the board) decides the shape of the swell and which of
 * the four ways it travels, so the same board has the same sea.
 */
export class SeaView {
  /** The way the swell travels, as a unit step in x and y. */
  readonly direction: readonly [number, number];
  private readonly layers: Drifting[];
  private ripples: RippleField | null = null;
  private whitecaps: WhitecapField | null = null;

  constructor(
    scene: Phaser.Scene,
    bounds: SeaBounds,
    seed: number,
    mode: SeaMode = 'ripples',
    features?: SeaFeatures,
    look: SeaLook = seaLookFor(undefined),
  ) {
    const palette: SeaPalette = look.palette;
    const { direction, axis } = swellFor(seed);
    this.direction = direction;

    const tag = paletteTag(palette);
    const depthKey = `sea-depth-${tag}-${seed}`;
    const swellKey = `sea-swell-${tag}-${seed}`;
    const chopKey = `sea-chop-${tag}-${seed}`;
    // With the board to go on, the depth is worked out from it; otherwise (and in
    // the older `lines` sea) it is a tiled noise layer.
    const procedural = mode === 'ripples' && features !== undefined;
    if (!procedural) {
      ensureLayer(scene, depthKey, () => depthLayer(seed, palette));
    }
    const bandKey = `sea-band-${tag}-${seed}`;
    const bands = mode === 'ripples' && currentSwellBands();
    if (mode === 'lines') {
      ensureLayer(scene, swellKey, () => swellLayer(seed, palette, axis));
      ensureLayer(scene, chopKey, () => chopLayer(seed, palette, axis));
    } else if (bands) {
      ensureLayer(scene, bandKey, () => bandLayer(seed, palette, axis));
    }
    ensureGlint(scene, palette);

    const layer = (key: string, depth: number, dir: readonly [number, number], speed: number): Drifting => ({
      sprite: scene.add
        .tileSprite(bounds.x, bounds.y, bounds.width, bounds.height, key)
        .setOrigin(0)
        .setDepth(depth)
        .setTileScale(SEA_SCALE, SEA_SCALE),
      direction: dir,
      speed,
      x: 0,
      y: 0,
    });

    // The depth does not move, so it needs no entry in the moving list.
    if (procedural && features) {
      this.addDepthMap(scene, bounds, seed, palette, features);
    } else {
      layer(depthKey, 0, direction, 0);
    }
    this.layers =
      mode === 'lines'
        ? [
            layer(swellKey, 0.02, direction, SWELL_SPEED),
            layer(chopKey, 0.04, direction, CHOP_SPEED),
          ]
        : bands
          ? [layer(bandKey, 0.02, direction, BAND_SPEED)]
          : [];

    if (mode === 'ripples') {
      // Spread over the board and a few cells round it, where the player looks.
      const spread = 3 * TILE_SIZE;
      const span = 20 * TILE_SIZE + spread * 2;
      const area = {
        left: bounds.x + bounds.width / 2 - 10 * TILE_SIZE - spread,
        top: bounds.y + bounds.height / 2 - 10 * TILE_SIZE - spread,
        width: span,
        height: span,
      };
      this.ripples = new RippleField(scene, area, axis, seed, palette, look.ripples, look.rippleWait);
      if (look.whitecaps > 0) {
        this.whitecaps = new WhitecapField(scene, area, axis, seed, palette, look.whitecaps);
      }
    }
    this.addTwinkles(scene, bounds, seed, mode === 'ripples' ? 30 : TWINKLES, palette);
  }

  /**
   * The depth of the water, worked out from the board and drawn as one picture
   * that is not repeated anywhere: shallows round the rocks, deeper water round
   * the whirlpools, open sea past the edge. Plain open-sea colour fills the rest
   * of the sea underneath it, which the picture fades into at its edge.
   */
  private addDepthMap(
    scene: Phaser.Scene,
    bounds: SeaBounds,
    seed: number,
    palette: SeaPalette,
    features: SeaFeatures,
  ): void {
    const reach = DEPTH_MARGIN_CELLS * TILE_SIZE;
    const left = features.board.x - reach;
    const top = features.board.y - reach;
    const width = Math.round((features.board.width + reach * 2) / SEA_SCALE);
    const height = Math.round((features.board.height + reach * 2) / SEA_SCALE);
    const toPicture = (p: Point): Point => ({ x: (p.x - left) / SEA_SCALE, y: (p.y - top) / SEA_SCALE });

    const key = `sea-depth-map-${paletteTag(palette)}-${seed}`;
    if (!scene.textures.exists(key)) {
      const levels = generateDepthLevels({
        width,
        height,
        board: {
          x: reach / SEA_SCALE,
          y: reach / SEA_SCALE,
          width: features.board.width / SEA_SCALE,
          height: features.board.height / SEA_SCALE,
        },
        rocks: features.rocks.map(toPicture),
        whirlpools: features.whirlpools.map(toPicture),
        seed,
      });
      const canvas = scene.textures.createCanvas(key, width, height);
      const context = canvas?.getContext();
      if (canvas && context) {
        const image = context.createImageData(width, height);
        image.data.set(levelsToRgba(levels, palette.depthMap));
        context.putImageData(image, 0, 0);
        canvas.refresh();
        canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Open sea under everything, and the depth picture over it.
    scene.add
      .rectangle(bounds.x, bounds.y, bounds.width, bounds.height, Number.parseInt(palette.depthMap[3].slice(1), 16))
      .setOrigin(0)
      .setDepth(-0.1);
    scene.add
      .image(left, top, key)
      .setOrigin(0)
      .setDepth(0)
      .setScale(SEA_SCALE);
  }

  /** Glints that fade in and out at their own times, near the board. */
  private addTwinkles(
    scene: Phaser.Scene,
    bounds: SeaBounds,
    seed: number,
    count: number,
    palette: SeaPalette,
  ): void {
    const random = seededRandom(seed ^ 0xc0ffee);
    // Spread over the board and a few cells round it, where the player looks.
    const spread = 8 * TILE_SIZE;
    const left = bounds.x + bounds.width / 2 - 10 * TILE_SIZE - spread;
    const top = bounds.y + bounds.height / 2 - 10 * TILE_SIZE - spread;
    const span = 20 * TILE_SIZE + spread * 2;

    for (let i = 0; i < count; i += 1) {
      const x = Math.round((left + random() * span) / SEA_SCALE) * SEA_SCALE;
      const y = Math.round((top + random() * span) / SEA_SCALE) * SEA_SCALE;
      const glint = scene.add
        .image(x, y, `sea-glint-${paletteTag(palette)}`)
        .setDepth(0.06)
        .setScale(SEA_SCALE)
        .setAlpha(0);
      scene.tweens.add({
        targets: glint,
        alpha: 0.85,
        duration: 600 + random() * 700,
        yoyo: true,
        repeat: -1,
        delay: random() * 4000,
        repeatDelay: 2500 + random() * 5000,
      });
    }
  }

  /** Moves the layers on by `deltaMs`, a whole art pixel at a time. */
  update(deltaMs: number): void {
    this.ripples?.update(deltaMs);
    this.whitecaps?.update(deltaMs);
    for (const layer of this.layers) {
      const step = (layer.speed * deltaMs) / 1000;
      // The texture slides the way the swell goes when its position decreases.
      layer.x -= layer.direction[0] * step;
      layer.y -= layer.direction[1] * step;
      layer.sprite.tilePositionX = Math.round(layer.x);
      layer.sprite.tilePositionY = Math.round(layer.y);
    }
  }
}
