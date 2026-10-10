import type { GameState } from '../domain/GameState';
import type { Entity } from '../domain/Entity';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import { inBounds } from '../domain/Board';
import { translate } from '../domain/Position';
import { vectorFor } from '../domain/Direction';
import { blockingEntityAt } from './selectors';

export type BlockReason = 'out_of_bounds' | 'obstacle' | 'ship';

export interface CollisionResult {
  readonly blocked: boolean;
  readonly reason: BlockReason | null;
}

const FREE: CollisionResult = { blocked: false, reason: null };

/** Whether a ship may occupy the given cell. */
export function checkBlocked(
  state: GameState,
  position: Position,
  ignoreShipId: string,
): CollisionResult {
  if (!inBounds(state.board, position)) {
    return { blocked: true, reason: 'out_of_bounds' };
  }
  const entity = blockingEntityAt(state, position, ignoreShipId);
  if (!entity) {
    return FREE;
  }
  return {
    blocked: true,
    reason: entity.kind === 'ship' ? 'ship' : 'obstacle',
  };
}

export interface RayHit {
  readonly entity: Entity;
  readonly position: Position;
}

/**
 * Walks a straight ray from (but not including) the origin and returns the
 * first entity encountered within `range` cells. Used by combat: the first
 * blocking entity stops the shot. Returns undefined when nothing is hit.
 */
export function firstEntityAlongRay(
  state: GameState,
  origin: Position,
  direction: Direction,
  range: number,
  ignoreShipId: string,
): RayHit | undefined {
  let cursor = origin;
  for (let step = 0; step < range; step += 1) {
    cursor = translate(cursor, vectorFor(direction));
    if (!inBounds(state.board, cursor)) {
      return undefined;
    }
    const entity = blockingEntityAt(state, cursor, ignoreShipId);
    if (entity) {
      return { entity, position: cursor };
    }
  }
  return undefined;
}

/** The cell a shot reaches when nothing blocks it. */
export function rayEndpoint(
  origin: Position,
  direction: Direction,
  range: number,
): Position {
  return translate(origin, {
    x: vectorFor(direction).x * range,
    y: vectorFor(direction).y * range,
  });
}
