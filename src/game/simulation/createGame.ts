import type { GameState } from '../domain/GameState';
import type { Obstacle } from '../domain/Board';
import type { EntityId, Side } from '../domain/Entity';
import type { Ship, WeaponMount, WeaponSide } from '../domain/Ship';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import { createBoard } from '../domain/Board';
import { emptyCannonQueue, emptyQueue } from '../domain/Action';
import { cloneInventory } from '../domain/Action';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CANNON_STARTING_AMMO,
  ENEMY_SHIP_TYPE,
  ENEMY_START,
  ENEMY_START_HEADING,
  INITIAL_TOKEN_POOL,
  OBSTACLE_LAYOUT,
  PLAYER_SHIP_TYPE,
  PLAYER_START,
  PLAYER_START_HEADING,
} from '../config/gameRules';
import { getShipType } from '../config/shipTypes';

const BROADSIDE_ORDER: readonly WeaponSide[] = ['left', 'right'];

export function createShip(
  id: EntityId,
  side: Side,
  position: Position,
  heading: Direction,
  shipTypeId: string,
): Ship {
  const type = getShipType(shipTypeId);
  const weapons: WeaponMount[] = [];
  for (const weaponSide of BROADSIDE_ORDER) {
    const weaponTypeId = type.broadsides[weaponSide];
    if (weaponTypeId) {
      weapons.push({ weaponTypeId, side: weaponSide });
    }
  }

  return {
    id,
    kind: 'ship',
    side,
    shipTypeId,
    heading,
    hp: type.maxHp,
    maxHp: type.maxHp,
    position: { ...position },
    weapons,
  };
}

/** Builds the deterministic starting position for the vertical slice. */
export function createGame(seed = 1): GameState {
  const obstacles: Record<EntityId, Obstacle> = {};
  for (const layout of OBSTACLE_LAYOUT) {
    obstacles[layout.id] = {
      id: layout.id,
      kind: layout.kind,
      position: { x: layout.x, y: layout.y },
    };
  }

  const ships: Record<EntityId, Ship> = {
    'player-ship': createShip(
      'player-ship',
      'player',
      PLAYER_START,
      PLAYER_START_HEADING,
      PLAYER_SHIP_TYPE,
    ),
    'enemy-ship': createShip(
      'enemy-ship',
      'enemy',
      ENEMY_START,
      ENEMY_START_HEADING,
      ENEMY_SHIP_TYPE,
    ),
  };

  return {
    seed,
    turn: 1,
    status: 'planning',
    board: createBoard(BOARD_WIDTH, BOARD_HEIGHT),
    ships,
    obstacles,
    tokenInventories: {
      player: cloneInventory(INITIAL_TOKEN_POOL),
      enemy: cloneInventory(INITIAL_TOKEN_POOL),
    },
    queues: { player: emptyQueue(), enemy: emptyQueue() },
    cannonQueues: { player: emptyCannonQueue(), enemy: emptyCannonQueue() },
    ammo: { player: CANNON_STARTING_AMMO, enemy: CANNON_STARTING_AMMO },
    tokenGeneration: { auto: true, requested: 'FORWARD', rotationIndex: 0 },
    winner: null,
  };
}
