import type { Position } from '@pirate/game-core/domain/Position';

/** Pixel size of one logical grid cell. Matches the Kenney 64x64 tiles. */
export const TILE_SIZE = 64;

export function gridToWorld(position: Position): { x: number; y: number } {
  return {
    x: (position.x + 0.5) * TILE_SIZE,
    y: (position.y + 0.5) * TILE_SIZE,
  };
}

export function worldToGrid(x: number, y: number): Position {
  return {
    x: Math.floor(x / TILE_SIZE),
    y: Math.floor(y / TILE_SIZE),
  };
}

/** Decorative ocean drawn around the playable board (in tiles). */
export const WORLD_MARGIN_TILES = 6;
