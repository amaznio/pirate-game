/**
 * Central registry of texture keys. Scenes and views reference these keys,
 * never literal filenames, so swapping placeholders for Scallywag art only
 * touches BootScene + this file.
 */
export const AssetKeys = {
  water: 'water',
  shipPlayer: 'ship-player',
  shipEnemy: 'ship-enemy',
  rock: 'rock',
  island: 'island',
  projectile: 'projectile',
  flash: 'flash',
  splash: 'splash',
} as const;

export type AssetKey = (typeof AssetKeys)[keyof typeof AssetKeys];
