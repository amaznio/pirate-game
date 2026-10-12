import Phaser from 'phaser';
import { STONE_COUNT, ScallywagKeys, stoneFrameName } from './scallywag';
import { CALM_SEA } from './seaPixels';
import {
  SURF_REACH,
  foamMask,
  haloMask,
  maskFromAlpha,
  padMask,
  type Mask,
} from './surfPixels';

export const surfHaloKey = (stone: number): string => `surf-halo-${stone}`;
export const surfFoamKey = (stone: number, step: number): string => `surf-foam-${stone}-${step}`;

function paintMask(
  scene: Phaser.Scene,
  key: string,
  mask: Mask,
  colour: string,
  alpha: number,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const canvas = scene.textures.createCanvas(key, mask.width, mask.height);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  context.fillStyle = colour;
  context.globalAlpha = alpha;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x]) {
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * For each of the twelve stones, traces its outline from the water sheet and
 * paints a halo of shallows and the steps of a wash of foam round it. Each
 * picture is the size of its stone plus `SURF_REACH` pixels on every side, so it
 * sits centred on the stone.
 */
export function buildSurfTextures(scene: Phaser.Scene): void {
  const sheet = scene.textures.get(ScallywagKeys.water).getSourceImage() as CanvasImageSource;
  for (let stone = 0; stone < STONE_COUNT; stone += 1) {
    const frame = scene.textures.getFrame(ScallywagKeys.water, stoneFrameName(stone));
    if (!frame) {
      continue;
    }
    const scratch = document.createElement('canvas');
    scratch.width = frame.width;
    scratch.height = frame.height;
    const context = scratch.getContext('2d');
    if (!context) {
      continue;
    }
    context.drawImage(sheet, frame.cutX, frame.cutY, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const mask = maskFromAlpha(context.getImageData(0, 0, frame.width, frame.height).data, frame.width, frame.height);
    const padded = padMask(mask, SURF_REACH);

    paintMask(scene, surfHaloKey(stone), haloMask(padded), CALM_SEA.swellLight, 0.55);
    for (let step = 1; step <= 4; step += 1) {
      paintMask(scene, surfFoamKey(stone, step), foamMask(padded, step), CALM_SEA.foam, step === 4 ? 0.7 : 0.95);
    }
  }
}
