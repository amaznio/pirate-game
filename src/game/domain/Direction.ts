import type { Position } from './Position';

export type Direction = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

export const DIRECTIONS: readonly Direction[] = [
  'NORTH',
  'EAST',
  'SOUTH',
  'WEST',
];

/** Grid delta for one step in each cardinal heading. */
export const DIRECTION_VECTORS: Record<Direction, Position> = {
  NORTH: { x: 0, y: -1 },
  EAST: { x: 1, y: 0 },
  SOUTH: { x: 0, y: 1 },
  WEST: { x: -1, y: 0 },
};

export function vectorFor(direction: Direction): Position {
  return DIRECTION_VECTORS[direction];
}

/** 90 degrees counter-clockwise. */
export function turnLeft(direction: Direction): Direction {
  switch (direction) {
    case 'NORTH':
      return 'WEST';
    case 'WEST':
      return 'SOUTH';
    case 'SOUTH':
      return 'EAST';
    case 'EAST':
      return 'NORTH';
  }
}

/** 90 degrees clockwise. */
export function turnRight(direction: Direction): Direction {
  switch (direction) {
    case 'NORTH':
      return 'EAST';
    case 'EAST':
      return 'SOUTH';
    case 'SOUTH':
      return 'WEST';
    case 'WEST':
      return 'NORTH';
  }
}

export function opposite(direction: Direction): Direction {
  return turnLeft(turnLeft(direction));
}

/** The left/right broadside directions relative to a heading. */
export function leftBroadside(direction: Direction): Direction {
  return turnLeft(direction);
}

export function rightBroadside(direction: Direction): Direction {
  return turnRight(direction);
}

export function directionFromName(value: string): Direction | undefined {
  return DIRECTIONS.find((d) => d === value);
}
