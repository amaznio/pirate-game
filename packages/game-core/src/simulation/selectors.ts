import type { GameState } from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { Obstacle } from '../domain/Board';
import type { Entity, PlayerId } from '../domain/Entity';
import type { Position } from '../domain/Position';
import { positionsEqual } from '../domain/Position';

/** The ship a player commands (one ship per player). */
export function getShipByOwner(
  state: GameState,
  playerId: PlayerId,
): Ship | undefined {
  const player = state.players[playerId];
  return player ? state.ships[player.shipId] : undefined;
}

export function getLivingShips(state: GameState): Ship[] {
  return Object.values(state.ships).filter((ship) => ship.hp > 0);
}

/** Living ships on a different team from `ship`. */
export function getHostiles(state: GameState, ship: Ship): Ship[] {
  return getLivingShips(state).filter((other) => other.teamId !== ship.teamId);
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
