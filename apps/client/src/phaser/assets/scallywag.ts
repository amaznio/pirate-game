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
  ships: 'scallywagShips',
  water: 'scallywagWater',
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

/** Every named frame cut from the water sheet. */
export function waterFrameRects(): FrameRect[] {
  return STONE_BOXES.map((box, index) => ({
    name: stoneFrameName(index),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
  }));
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

  CANNON_BOXES.forEach((box, index) => {
    rects.push({ name: cannonFrameName(index + 1), x: box.x, y: box.y, w: box.w, h: box.h });
  });

  return rects;
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
