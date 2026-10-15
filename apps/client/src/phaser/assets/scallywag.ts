import { PICKUP_KINDS, type PickupKind } from '@pirate/game-core/domain/Pickup';
import type Phaser from 'phaser';

/**
 * The Scallywag art (Pixel Carvel / Foozle, CC0), served from
 * public/assets/scallywag/. The sheets are cut into named frames from boxes
 * measured on the originals, so nothing else needs to know pixel positions.
 *
 * Ships point SOUTH (bow at the bottom) at rotation 0, the same as the old art,
 * so `headingToAngle` is unchanged.
 */
export const ScallywagKeys = {
  /**
   * The ships sheet as the game uses it: every frame copied onto a canvas with
   * a transparent margin round it (see `buildPaddedShipSheet`).
   */
  ships: 'scallywagShips',
  /** The ships sheet exactly as it was loaded, frames touching. */
  shipsRaw: 'scallywagShipsRaw',
  water: 'scallywagWater',
  /** The Fort sheet: the barrel. */
  fort: 'scallywagFort',
  /** The hunt's treasure chest (drawn by tools/art/treasure.py). */
  treasure: 'scallywagTreasure',
} as const;

export type HullSize = 'small' | 'medium' | 'large';
/** A hull is whole, cracked, or broken in pieces (the sinking animation). */
export type HullState = 'intact' | 'damaged' | 'split';

export const HULL_STATES: readonly HullState[] = ['intact', 'damaged', 'split'];

/** Brown, tan, red-orange, navy and gold-trimmed hulls; `grey` is a wreck. */
export const HULL_COLOURS = 5;

/** Grey, cream, green, yellow, blue, red. */
export const SAIL_COLOURS = ['grey', 'cream', 'green', 'yellow', 'blue', 'red'] as const;
export type SailColour = (typeof SAIL_COLOURS)[number];

interface HullLayout {
  /** Left edge of the first colour's column, and the distance to the next. */
  readonly x0: number;
  readonly pitch: number;
  /** One hull frame; a state's row starts every `h` pixels from the listed y. */
  readonly w: number;
  readonly h: number;
  readonly rows: Readonly<Record<HullState, number>>;
  /** Top of the grey wreck row (intact, damaged, broken). */
  readonly greyRow: number;
  /** Where the hull's own length ends, as a fraction of the frame, for the pivot. */
  readonly centreY: number;
}

export const HULL_LAYOUT: Readonly<Record<HullSize, HullLayout>> = {
  small: {
    x0: 0,
    pitch: 32,
    w: 32,
    h: 64,
    rows: { intact: 0, damaged: 64, split: 128 },
    greyRow: 192,
    centreY: 0.5,
  },
  medium: {
    x0: 160,
    pitch: 48,
    w: 48,
    h: 80,
    rows: { intact: 0, damaged: 80, split: 160 },
    greyRow: 240,
    centreY: 0.5,
  },
  large: {
    x0: 400,
    pitch: 48,
    w: 48,
    h: 128,
    rows: { intact: 0, damaged: 128, split: 256 },
    greyRow: 384,
    // The last 16 px of the frame are the bowsprit, so the hull's own centre is higher.
    centreY: 56 / 128,
  },
};

/**
 * Which hull picture a ship shows: whole while more than half its hull points
 * remain, cracked at half or less, broken in pieces at zero.
 */
export function hullStateFor(hp: number, maxHp: number): HullState {
  if (hp <= 0) {
    return 'split';
  }
  return hp * 2 > maxHp ? 'intact' : 'damaged';
}

export const hullFrameName = (
  size: HullSize,
  colour: number | 'grey',
  state: HullState,
): string => `hull/${size}/${colour}/${state}`;

export type SailKind = 'flatSmall' | 'billowSmall' | 'flatLarge' | 'billowLarge';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Sails sit in pairs of 32 px columns, 64 px per colour. */
const SAIL_BOXES: Readonly<Record<SailKind, Box>> = {
  flatSmall: { x: 6, y: 328, w: 20, h: 5 },
  billowSmall: { x: 38, y: 328, w: 20, h: 7 },
  flatLarge: { x: 2, y: 363, w: 28, h: 7 },
  billowLarge: { x: 34, y: 363, w: 28, h: 10 },
};

export const sailFrameName = (colour: SailColour, kind: SailKind): string =>
  `sail/${colour}/${kind}`;

/**
 * The spar a sail hangs from, in six colours (grey, dark brown, brown, red,
 * white, gold), 32 px apart. It is a little wider than the sail it carries; the
 * crossbar is the top few rows and the rest is the mast. `billow` bends with
 * the billowing sail.
 */
export const YARD_COLOURS = 6;
export type YardKind = 'flat' | 'billow';
const YARD_BOXES: Readonly<Record<YardKind, Box>> = {
  flat: { x: 0, y: 551, w: 32, h: 15 },
  billow: { x: 3, y: 583, w: 28, h: 15 },
};
/** Rows from the top of a yard frame to the middle of its crossbar. */
export const YARD_BAR_ROW = 3.5;
export const yardFrameName = (kind: YardKind, colour: number): string => `yard/${kind}/${colour}`;

/**
 * Emblems for a sail (birds, a skull and so on), drawn dark for pale sails and
 * light for dark ones. Five of them are large enough for the big sails.
 */
const EMBLEM_BOXES: readonly Box[] = [
  { x: 200, y: 493, w: 16, h: 7 },
  { x: 230, y: 493, w: 19, h: 7 },
  { x: 264, y: 493, w: 16, h: 7 },
  { x: 297, y: 493, w: 19, h: 7 },
  { x: 326, y: 493, w: 20, h: 7 },
];
export const EMBLEM_COUNT = EMBLEM_BOXES.length;
/** The sheet draws the light copies exactly 64 rows below the dark ones. */
const LIGHT_EMBLEM_OFFSET = 64;
export type EmblemTone = 'dark' | 'light';
export const emblemFrameName = (tone: EmblemTone, index: number): string =>
  `emblem/${tone}/${index}`;

/** Whether a sail is pale enough to carry a dark emblem. */
export const emblemToneFor = (sail: SailColour): EmblemTone =>
  sail === 'grey' || sail === 'cream' || sail === 'yellow' ? 'dark' : 'light';

/** Idle frames of the five cannon types (the fire animations come later). */
const CANNON_BOXES: readonly Box[] = [
  { x: 452, y: 566, w: 6, h: 6 },
  { x: 449, y: 582, w: 12, h: 6 },
  { x: 448, y: 596, w: 14, h: 8 },
  { x: 449, y: 611, w: 13, h: 11 },
  { x: 452, y: 628, w: 8, h: 8 },
];

export const cannonFrameName = (type: number): string => `cannon/${type}`;
export const CANNON_TYPES = CANNON_BOXES.length;

/** Smoke puff and explosion: four 16x16 frames each, side by side. */
export const FX_FRAMES = 4;
export const fxFrameName = (kind: 'puff' | 'explosion', frame: number): string =>
  `fx/${kind}/${frame}`;

/** The bow wave: six frames, 32 px wide and 64 tall, in two rows of three. */
export const WAKE_FRAMES = 6;
export const wakeFrameName = (frame: number): string => `wake/${frame}`;

export const SHIPS_SHEET_SIZE = { width: 720, height: 672 } as const;
export const WATER_SHEET_SIZE = { width: 384, height: 144 } as const;

/**
 * The twelve stones of the water sheet (three rows of four, 8 to 14 px across),
 * measured from the pixels. Rocks are drawn from these, a different one in each
 * cell, at 2x or 3x: the ships are drawn at their own size (a sloop is about 30
 * px wide), so a stone has to stay smaller than a ship's length to look in scale.
 */
const STONE_BOXES: readonly Box[] = [
  { x: 2, y: 99, w: 13, h: 10 },
  { x: 17, y: 99, w: 14, h: 12 },
  { x: 36, y: 101, w: 8, h: 6 },
  { x: 50, y: 99, w: 13, h: 10 },
  { x: 3, y: 115, w: 10, h: 10 },
  { x: 20, y: 117, w: 8, h: 6 },
  { x: 33, y: 115, w: 14, h: 12 },
  { x: 51, y: 115, w: 10, h: 10 },
  { x: 1, y: 130, w: 14, h: 13 },
  { x: 20, y: 133, w: 9, h: 7 },
  { x: 36, y: 133, w: 9, h: 7 },
  { x: 49, y: 130, w: 14, h: 13 },
];

export const STONE_COUNT = STONE_BOXES.length;
export const stoneFrameName = (index: number): string => `stone/${index}`;

/** Size in sheet pixels of a stone, for choosing how far to scale it up. */
export function stoneSize(index: number): { readonly w: number; readonly h: number } {
  return { w: STONE_BOXES[index].w, h: STONE_BOXES[index].h };
}

/** How many times a stone is magnified: 3x, or 2x for the smallest. */
export function stoneScale(index: number): number {
  return STONE_BOXES[index].w >= 9 ? 3 : 2;
}

/**
 * The six deep-water tiles (16x16, three across and two down at x 224, y 0).
 * Each tiles seamlessly with itself; played one after another they make the
 * sea shimmer.
 */
export const WATER_TILES = 6;
export const WATER_TILE_SIZE = 16;
export const waterTileFrameName = (index: number): string => `water/${index}`;

/** Every named frame cut from the water sheet. */
export function waterFrameRects(): FrameRect[] {
  const stones = STONE_BOXES.map((box, index) => ({
    name: stoneFrameName(index),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
  }));
  const tiles = Array.from({ length: WATER_TILES }, (_, index) => ({
    name: waterTileFrameName(index),
    x: 224 + WATER_TILE_SIZE * (index % 3),
    y: WATER_TILE_SIZE * Math.floor(index / 3),
    w: WATER_TILE_SIZE,
    h: WATER_TILE_SIZE,
  }));
  return [...stones, ...tiles];
}

export interface FrameRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Every named frame cut from the ships sheet. Pure, so it can be checked in a test. */
export function shipFrameRects(): FrameRect[] {
  const rects: FrameRect[] = [];

  for (const size of Object.keys(HULL_LAYOUT) as HullSize[]) {
    const layout = HULL_LAYOUT[size];
    for (let colour = 0; colour < HULL_COLOURS; colour += 1) {
      for (const state of HULL_STATES) {
        rects.push({
          name: hullFrameName(size, colour, state),
          x: layout.x0 + layout.pitch * colour,
          y: layout.rows[state],
          w: layout.w,
          h: layout.h,
        });
      }
    }
    HULL_STATES.forEach((state, index) => {
      rects.push({
        name: hullFrameName(size, 'grey', state),
        x: layout.x0 + layout.pitch * index,
        y: layout.greyRow,
        w: layout.w,
        h: layout.h,
      });
    });
  }

  SAIL_COLOURS.forEach((colour, index) => {
    for (const kind of Object.keys(SAIL_BOXES) as SailKind[]) {
      const box = SAIL_BOXES[kind];
      rects.push({ name: sailFrameName(colour, kind), x: box.x + 64 * index, y: box.y, w: box.w, h: box.h });
    }
  });

  for (let colour = 0; colour < YARD_COLOURS; colour += 1) {
    for (const kind of Object.keys(YARD_BOXES) as YardKind[]) {
      const box = YARD_BOXES[kind];
      rects.push({ name: yardFrameName(kind, colour), x: box.x + 32 * colour, y: box.y, w: box.w, h: box.h });
    }
  }

  EMBLEM_BOXES.forEach((box, index) => {
    rects.push({ name: emblemFrameName('dark', index), x: box.x, y: box.y, w: box.w, h: box.h });
    rects.push({
      name: emblemFrameName('light', index),
      x: box.x,
      y: box.y + LIGHT_EMBLEM_OFFSET,
      w: box.w,
      h: box.h,
    });
  });

  CANNON_BOXES.forEach((box, index) => {
    rects.push({ name: cannonFrameName(index + 1), x: box.x, y: box.y, w: box.w, h: box.h });
  });

  for (let frame = 0; frame < FX_FRAMES; frame += 1) {
    rects.push({ name: fxFrameName('puff', frame), x: 448 + 16 * frame, y: 608, w: 16, h: 16 });
    rects.push({ name: fxFrameName('explosion', frame), x: 448 + 16 * frame, y: 624, w: 16, h: 16 });
  }
  for (let frame = 0; frame < WAKE_FRAMES; frame += 1) {
    rects.push({
      name: wakeFrameName(frame),
      x: 352 + 32 * (frame % 3),
      y: 544 + 64 * Math.floor(frame / 3),
      w: 32,
      h: 64,
    });
  }

  return rects;
}

export interface PackedFrame extends FrameRect {
  /** Where the frame's pixels start on the new sheet. */
  readonly sheetX: number;
  readonly sheetY: number;
}

/**
 * Lays frames out in rows on a new sheet with `pad` transparent pixels all round
 * each, so nothing next to a frame can show through its edge. Pure.
 */
export function packFrames(
  rects: readonly FrameRect[],
  maxWidth: number,
  pad: number,
): { readonly width: number; readonly height: number; readonly frames: PackedFrame[] } {
  const frames: PackedFrame[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;

  for (const rect of rects) {
    const cellW = rect.w + pad * 2;
    const cellH = rect.h + pad * 2;
    if (x > 0 && x + cellW > maxWidth) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    frames.push({ ...rect, sheetX: x + pad, sheetY: y + pad });
    x += cellW;
    width = Math.max(width, x);
    rowHeight = Math.max(rowHeight, cellH);
  }
  return { width, height: y + rowHeight, frames };
}

/**
 * Copies every ship frame from the loaded sheet onto a new one with a margin
 * round each (the frames touch on the original, so a sprite on a fractional
 * pixel shows a sliver of its neighbour, such as the damaged hull's top rows
 * under a bow). The new sheet is registered as `ScallywagKeys.ships`, with the
 * same frame names.
 */
export function buildPaddedShipSheet(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(ScallywagKeys.ships)) {
    return;
  }
  const raw = textures.get(ScallywagKeys.shipsRaw).getSourceImage() as CanvasImageSource;
  const packed = packFrames(shipFrameRects(), 1024, 2);
  const canvas = textures.createCanvas(ScallywagKeys.ships, packed.width, packed.height);
  const context = canvas?.getContext();
  if (!canvas || !context) {
    return;
  }
  for (const frame of packed.frames) {
    context.drawImage(raw, frame.x, frame.y, frame.w, frame.h, frame.sheetX, frame.sheetY, frame.w, frame.h);
    canvas.add(frame.name, 0, frame.sheetX, frame.sheetY, frame.w, frame.h);
  }
  canvas.refresh();
}

/** Registers the stones on the loaded water sheet. Safe to call more than once. */
export function registerWaterFrames(textures: Phaser.Textures.TextureManager): void {
  const texture = textures.get(ScallywagKeys.water);
  for (const rect of waterFrameRects()) {
    if (!texture.has(rect.name)) {
      texture.add(rect.name, 0, rect.x, rect.y, rect.w, rect.h);
    }
  }
}

/** Registers every frame on the loaded ships sheet. Safe to call more than once. */
export function registerShipFrames(textures: Phaser.Textures.TextureManager): void {
  const texture = textures.get(ScallywagKeys.ships);
  for (const rect of shipFrameRects()) {
    if (!texture.has(rect.name)) {
      texture.add(rect.name, 0, rect.x, rect.y, rect.w, rect.h);
    }
  }
}

/**
 * The three pickups, cut from the Scallywag sheets: a barrel from the Fort
 * sheet, a chest and a plank from the Water and Islands sheet. Each is 6 to 16
 * art pixels across; they are drawn at 3x so they stay a good deal smaller
 * than a ship.
 */
export const PICKUP_SPRITES: Readonly<
  Record<PickupKind, { readonly texture: string; readonly rect: Omit<FrameRect, 'name'> }>
> = {
  barrel: { texture: ScallywagKeys.fort, rect: { x: 307, y: 83, w: 9, h: 11 } },
  crate: { texture: ScallywagKeys.water, rect: { x: 210, y: 51, w: 12, h: 10 } },
  plank: { texture: ScallywagKeys.water, rect: { x: 96, y: 133, w: 16, h: 6 } },
  chest: { texture: ScallywagKeys.treasure, rect: { x: 0, y: 0, w: 16, h: 14 } },
};

export const pickupFrameName = (kind: PickupKind): string => `pickup/${kind}`;

/** Registers the pickup frames on the loaded sheets. Safe to call more than once. */
export function registerPickupFrames(textures: Phaser.Textures.TextureManager): void {
  for (const kind of [...PICKUP_KINDS, 'chest' as const]) {
    const { texture, rect } = PICKUP_SPRITES[kind];
    const sheet = textures.get(texture);
    const name = pickupFrameName(kind);
    if (!sheet.has(name)) {
      sheet.add(name, 0, rect.x, rect.y, rect.w, rect.h);
    }
  }
}
