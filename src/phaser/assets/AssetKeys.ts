/**
 * Central registry of texture keys and frame ids. Scenes and views reference
 * these, never literal filenames, so swapping art only touches this file and
 * BootScene.
 *
 * Art: Kenney "Pirate Pack" (CC0) — see public/assets/kenney/.
 */
export const AssetKeys = {
  /** 64x64 terrain spritesheet (tiles_sheet.png). */
  tiles: 'tiles',
  /** Sparrow atlas: ships, cannonball, effects (shipsMiscellaneous_sheet). */
  ships: 'ships',
} as const;

/** Frame indices into the terrain spritesheet. */
export const TileFrames = {
  water: 72,
  sand: 17,
  grass: 22,
  rock: 50,
} as const;

/** Frame names inside the ships atlas. */
export const ShipFrames = {
  player: 'ship (5).png',
  enemy: 'ship (3).png',
} as const;

export const EffectFrames = {
  cannonball: 'cannonBall.png',
  explosion: 'explosion1.png',
} as const;
