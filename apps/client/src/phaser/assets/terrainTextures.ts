import Phaser from 'phaser';
import { DIRECTIONS } from '@pirate/game-core/domain/Direction';
import {
  PIXEL_WHIRLPOOL_SIZE,
  WHIRLPOOL_FRAMES,
  WIND_SIZE,
  pixelWhirlpoolKey,
  pixelWindKey,
  whirlpoolPixel,
  windPixel,
  type Pixel,
} from './pixelTerrain';

/** Texture keys for the wind and whirlpool art, drawn in code (no image files). */
export const TerrainTextures = {
  /** A pair of chevrons pointing EAST; rotated to the way the wind blows. */
  wind: 'terrain-wind',
  /** A 2x2-cell vortex that turns clockwise. */
  whirlpoolRight: 'terrain-whirlpool-right',
  /** ...and one that turns counter-clockwise. */
  whirlpoolLeft: 'terrain-whirlpool-left',
} as const;

const WHIRLPOOL_SIZE = 128;
const ARMS = 3;
const SWEEP = 2.3;

function drawWind(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(5, 0xffffff, 1);
  for (const dx of [-11, 7]) {
    g.beginPath();
    g.moveTo(32 + dx - 8, 32 - 13);
    g.lineTo(32 + dx + 6, 32);
    g.lineTo(32 + dx - 8, 32 + 13);
    g.strokePath();
  }
  g.generateTexture(TerrainTextures.wind, 64, 64);
  g.destroy();
}

/**
 * Spiral arms that trail behind the way the vortex turns, so it reads as
 * spinning even when it is standing still.
 */
function drawWhirlpool(scene: Phaser.Scene, key: string, clockwise: boolean): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = WHIRLPOOL_SIZE / 2;

  g.fillStyle(0x0a2f40, 0.55);
  g.fillCircle(c, c, c - 4);
  g.fillStyle(0x04141d, 0.6);
  g.fillCircle(c, c, 16);

  const trail = clockwise ? -1 : 1;
  for (let arm = 0; arm < ARMS; arm += 1) {
    const base = (arm * Math.PI * 2) / ARMS;
    let previous: { x: number; y: number } | null = null;
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const radius = 12 + (c - 14) * t;
      const angle = base + trail * t * SWEEP;
      const point = {
        x: c + Math.cos(angle) * radius,
        y: c + Math.sin(angle) * radius,
      };
      if (previous) {
        g.lineStyle(7 * (1 - t) + 2, 0xe8f6ff, 0.9 - 0.45 * t);
        g.lineBetween(previous.x, previous.y, point.x, point.y);
      }
      previous = point;
    }
  }

  g.generateTexture(key, WHIRLPOOL_SIZE, WHIRLPOOL_SIZE);
  g.destroy();
}

/** Draws the terrain textures once; safe to call again. */
export function generateTerrainTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TerrainTextures.wind)) {
    drawWind(scene);
  }
  if (!scene.textures.exists(TerrainTextures.whirlpoolRight)) {
    drawWhirlpool(scene, TerrainTextures.whirlpoolRight, true);
  }
  if (!scene.textures.exists(TerrainTextures.whirlpoolLeft)) {
    drawWhirlpool(scene, TerrainTextures.whirlpoolLeft, false);
  }
}

/** Paints a picture, one art pixel at a time, onto a crisp canvas texture. */
function paintPixels(
  scene: Phaser.Scene,
  key: string,
  size: number,
  pixelAt: (x: number, y: number) => Pixel,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const canvas = scene.textures.createCanvas(key, size, size);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const colour = pixelAt(x, y);
      if (colour) {
        context.fillStyle = colour;
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** The pixel-art wind and whirlpool pictures (used with the Scallywag art). */
export function generatePixelTerrainTextures(scene: Phaser.Scene): void {
  for (const direction of DIRECTIONS) {
    paintPixels(scene, pixelWindKey(direction), WIND_SIZE, (x, y) =>
      windPixel(x, y, direction),
    );
  }
  for (const clockwise of [true, false]) {
    for (let frame = 0; frame < WHIRLPOOL_FRAMES; frame += 1) {
      paintPixels(scene, pixelWhirlpoolKey(clockwise, frame), PIXEL_WHIRLPOOL_SIZE, (x, y) =>
        whirlpoolPixel(x, y, frame, clockwise),
      );
    }
  }
}
