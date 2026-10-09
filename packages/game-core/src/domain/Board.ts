import type { Entity } from './Entity';
import type { Position } from './Position';

/** Static terrain that occupies cells and blocks movement/shots. */
export interface Obstacle extends Entity {
  readonly kind: 'rock' | 'island';
}

export interface Board {
  readonly width: number;
  readonly height: number;
}

export function createBoard(width: number, height: number): Board {
  return { width, height };
}

export function inBounds(board: Board, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < board.width &&
    position.y < board.height
  );
}
