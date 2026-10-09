import type { Position } from '../game/domain/Position';

/** Pixel size of one logical grid cell. Defined once for the whole layer. */
export const TILE_SIZE = 48;

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
