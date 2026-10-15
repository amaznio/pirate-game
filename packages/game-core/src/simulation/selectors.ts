import type { GameState } from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { Obstacle } from '../domain/Board';
import type { Entity, PlayerId } from '../domain/Entity';
import type { Monster } from '../domain/Monster';
import { monsterCells } from '../domain/Monster';
import { getMonsterType, isMobileType } from '../config/monsterTypes';
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

export function getLivingMonsters(state: Pick<GameState, 'monsters'>): Monster[] {
  return Object.values(state.monsters ?? {}).filter((monster) => monster.hp > 0);
}

/** The living monster that fills a cell, if any. */
export function monsterAt(
  state: Pick<GameState, 'monsters'>,
  position: Position,
): Monster | undefined {
  if (!state.monsters) {
    return undefined;
  }
  return getLivingMonsters(state).find((monster) =>
    monsterCells(monster, getMonsterType(monster.monsterTypeId).length).some((cell) =>
      positionsEqual(cell, position),
    ),
  );
}

/**
 * The living monster that never moves and fills a cell, if any. A sailing
 * monster is handled like a ship by the movement rules, so it is not part of the
 * fixed scenery they check.
 */
export function solidMonsterAt(
  state: Pick<GameState, 'monsters'>,
  position: Position,
): Monster | undefined {
  const monster = monsterAt(state, position);
  return monster && !isMobileType(getMonsterType(monster.monsterTypeId)) ? monster : undefined;
}

export function blockingEntityAt(
  state: GameState,
  position: Position,
  ignoreShipId?: string,
): Entity | undefined {
  return (
    obstacleAt(state, position) ?? monsterAt(state, position) ?? shipAt(state, position, ignoreShipId)
  );
}
