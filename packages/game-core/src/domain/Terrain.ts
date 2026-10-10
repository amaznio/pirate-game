import type { Direction } from './Direction';
import { vectorFor } from './Direction';
import type { Position } from './Position';
import { translate } from './Position';

/** Which way a whirlpool turns. `right` is clockwise, `left` counter-clockwise. */
export type Spin = 'left' | 'right';

/** Which quarter of its 2x2 whirlpool a cell is. */
export type WhirlpoolCorner =
  | 'topLeft'
  | 'topRight'
  | 'bottomRight'
  | 'bottomLeft';

/**
 * Cells that act on a ship that ends a phase on them. Unlike a rock they never
 * block anything: ships sail onto them freely and are then carried.
 *
 *  - `wind` pushes the ship one cell in `direction`, once per phase (a ship
 *    left on a row of wind is carried along it, a cell each phase).
 *  - `whirlpool` is a 2x2 vortex. Each of its four cells carries the ship to
 *    the next cell around the ring and turns it a quarter in the same way.
 */
export type Terrain =
  | { readonly kind: 'wind'; readonly direction: Direction }
  | {
      readonly kind: 'whirlpool';
      readonly spin: Spin;
      readonly corner: WhirlpoolCorner;
    };

/** Terrain by cell, keyed `"x,y"`. Cells without an entry are open water. */
export type TerrainMap = Readonly<Record<string, Terrain>>;

export function cellKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function terrainAt(
  terrain: TerrainMap,
  position: Position,
): Terrain | undefined {
  return terrain[cellKey(position)];
}

/** Where each corner of a clockwise whirlpool sends a ship. */
const CLOCKWISE_STEP: Record<WhirlpoolCorner, Position> = {
  topLeft: { x: 1, y: 0 },
  topRight: { x: 0, y: 1 },
  bottomRight: { x: -1, y: 0 },
  bottomLeft: { x: 0, y: -1 },
};

/** ...and each corner of a counter-clockwise one. */
const COUNTER_CLOCKWISE_STEP: Record<WhirlpoolCorner, Position> = {
  topLeft: { x: 0, y: 1 },
  bottomLeft: { x: 1, y: 0 },
  bottomRight: { x: 0, y: -1 },
  topRight: { x: -1, y: 0 },
};

/** The move a whirlpool cell makes, as a cell offset. */
export function whirlpoolDelta(spin: Spin, corner: WhirlpoolCorner): Position {
  return (spin === 'right' ? CLOCKWISE_STEP : COUNTER_CLOCKWISE_STEP)[corner];
}

const CORNER_OFFSETS: ReadonlyArray<readonly [WhirlpoolCorner, number, number]> = [
  ['topLeft', 0, 0],
  ['topRight', 1, 0],
  ['bottomLeft', 0, 1],
  ['bottomRight', 1, 1],
];

/** The four cells of a whirlpool whose top-left cell is `anchor`. */
export function whirlpoolCells(
  anchor: Position,
  spin: Spin,
): Array<{ position: Position; terrain: Terrain }> {
  return CORNER_OFFSETS.map(([corner, dx, dy]) => ({
    position: { x: anchor.x + dx, y: anchor.y + dy },
    terrain: { kind: 'whirlpool', spin, corner },
  }));
}

/** `length` cells of wind in a straight line, starting at `start`. */
export function windLane(
  start: Position,
  direction: Direction,
  length: number,
): Array<{ position: Position; terrain: Terrain }> {
  const cells: Array<{ position: Position; terrain: Terrain }> = [];
  let position = start;
  for (let i = 0; i < length; i += 1) {
    cells.push({ position, terrain: { kind: 'wind', direction } });
    position = translate(position, vectorFor(direction));
  }
  return cells;
}

/** Builds a TerrainMap from placed cells. */
export function terrainFrom(
  ...groups: Array<Array<{ position: Position; terrain: Terrain }>>
): TerrainMap {
  const map: Record<string, Terrain> = {};
  for (const group of groups) {
    for (const cell of group) {
      map[cellKey(cell.position)] = cell.terrain;
    }
  }
  return map;
}
