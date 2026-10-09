import type { GameState } from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { Obstacle } from '../domain/Board';
import type { Entity } from '../domain/Entity';
import type { Side } from '../domain/Entity';
import type { Position } from '../domain/Position';
import { positionsEqual } from '../domain/Position';

export function getShipBySide(state: GameState, side: Side): Ship | undefined {
  return Object.values(state.ships).find((ship) => ship.side === side);
}

export function getOpponent(state: GameState, side: Side): Ship | undefined {
  return Object.values(state.ships).find(
    (ship) => ship.side !== side && ship.hp > 0,
  );
}

export function obstacleAt(
  state: GameState,
  position: Position,
): Obstacle | undefined {
  return Object.values(state.obstacles).find((obstacle) =>
    positionsEqual(obstacle.position, position),
  );
}

export function shipAt(
  state: GameState,
  position: Position,
  ignoreShipId?: string,
): Ship | undefined {
  return Object.values(state.ships).find(
    (ship) =>
      ship.hp > 0 &&
      ship.id !== ignoreShipId &&
      positionsEqual(ship.position, position),
  );
}

export function blockingEntityAt(
  state: GameState,
  position: Position,
  ignoreShipId?: string,
): Entity | undefined {
  return (
    obstacleAt(state, position) ?? shipAt(state, position, ignoreShipId)
  );
}
