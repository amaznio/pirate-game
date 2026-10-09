import type { GameState } from '../../domain/GameState';
import type { Obstacle } from '../../domain/Board';
import type { Ship } from '../../domain/Ship';
import type { EntityId } from '../../domain/Entity';
import type { ActionSlot, CannonSlot } from '../../domain/Action';
import type { SubmittedActions } from '../../domain/TurnResult';
import { createGame } from '../createGame';

/** A ship with both broadsides armed, based on the configured sloop. */
export function defaultPlayer(overrides: Partial<Ship> = {}): Ship {
  const base = createGame().ships['player-ship'];
  return { ...base, ...overrides };
}

/** A weaponless enemy by default so combat tests stay isolated. */
export function defaultEnemy(overrides: Partial<Ship> = {}): Ship {
  const base = createGame().ships['enemy-ship'];
  return { ...base, weapons: [], ...overrides };
}

export function rock(id: EntityId, x: number, y: number): Obstacle {
  return { id, kind: 'rock', position: { x, y } };
}

export function gameWith(
  player: Ship,
  enemy: Ship,
  obstacles: Obstacle[] = [],
): GameState {
  const base = createGame();
  const ships: Record<EntityId, Ship> = {
    [player.id]: player,
    [enemy.id]: enemy,
  };
  const obstacleMap: Record<EntityId, Obstacle> = {};
  for (const obstacle of obstacles) {
    obstacleMap[obstacle.id] = obstacle;
  }
  return { ...base, ships, obstacles: obstacleMap };
}

export function cannon(left: boolean, right: boolean): CannonSlot {
  return { left, right };
}

/** Builds a phase-aligned SubmittedActions for tests. */
export function submitted(
  playerMovement: ActionSlot[] = [],
  playerCannons: CannonSlot[] = [],
  enemyMovement: ActionSlot[] = [],
  enemyCannons: CannonSlot[] = [],
): SubmittedActions {
  return {
    player: { movement: playerMovement, cannons: playerCannons },
    enemy: { movement: enemyMovement, cannons: enemyCannons },
  };
}
