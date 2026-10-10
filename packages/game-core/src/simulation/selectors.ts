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

/** Obstacles by cell, built once per obstacle map (they never change in a match). */
const obstacleIndex = new WeakMap<object, Map<string, Obstacle>>();

export function obstacleAt(
  state: GameState,
  position: Position,
): Obstacle | undefined {
  let index = obstacleIndex.get(state.obstacles);
  if (!index) {
    index = new Map();
    for (const obstacle of Object.values(state.obstacles)) {
      index.set(`${obstacle.position.x},${obstacle.position.y}`, obstacle);
    }
    obstacleIndex.set(state.obstacles, index);
  }
  return index.get(`${position.x},${position.y}`);
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
