import {
  DEFAULT_AI_DIFFICULTY,
  type GameState,
  type PlayerState,
} from '../domain/GameState';
import type { Obstacle } from '../domain/Board';
import type { EntityId, PlayerId, TeamId } from '../domain/Entity';
import type { Ship, WeaponMount, WeaponSide } from '../domain/Ship';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import { createBoard } from '../domain/Board';
import { cannonDamageBonus } from '../domain/CarryOver';
import {
  cloneInventory,
  emptyCannonQueue,
  emptyQueue,
} from '../domain/Action';
import { cannonsPerSideOf, getShipType } from '../config/shipTypes';
import { createDuelConfig, type MatchConfig } from '../config/matchConfig';

const BROADSIDE_ORDER: readonly WeaponSide[] = ['left', 'right'];

/** Ship ids are derived from the owner, so they are stable across a match. */
export function shipIdFor(playerId: PlayerId): EntityId {
  return `${playerId}-ship`;
}

export function createShip(
  id: EntityId,
  ownerId: PlayerId,
  teamId: TeamId,
  position: Position,
  heading: Direction,
  shipTypeId: string,
): Ship {
  const type = getShipType(shipTypeId);
  const weapons: WeaponMount[] = [];
  for (const weaponSide of BROADSIDE_ORDER) {
    const weaponTypeId = type.broadsides[weaponSide];
    if (weaponTypeId) {
      for (let i = 0; i < cannonsPerSideOf(type); i += 1) {
        weapons.push({ weaponTypeId, side: weaponSide });
      }
    }
  }

  return {
    id,
    kind: 'ship',
    ownerId,
    teamId,
    shipTypeId,
    heading,
    hp: type.maxHp,
    maxHp: type.maxHp,
    position: { ...position },
    weapons,
  };
}

/**
 * Builds the starting GameState for a match. With no config it is the classic
 * 1v1 on open water; real matches pass a config with a generated sea.
 */
export function createGame(
  config: MatchConfig = createDuelConfig({ sea: 'open' }),
): GameState {
  const obstacles: Record<EntityId, Obstacle> = {};
  for (const layout of config.obstacles) {
    obstacles[layout.id] = {
      id: layout.id,
      kind: layout.kind,
      position: { x: layout.x, y: layout.y },
    };
  }

  const ships: Record<EntityId, Ship> = {};
  const players: Record<PlayerId, PlayerState> = {};
  for (const participant of config.participants) {
    const id = shipIdFor(participant.playerId);
    ships[id] = createShip(
      id,
      participant.playerId,
      participant.teamId,
      participant.spawn.position,
      participant.spawn.heading,
      participant.shipTypeId,
    );
    const shipType = getShipType(participant.shipTypeId);
    const carried = config.carryOver?.[participant.playerId];
    const bonusDamage = cannonDamageBonus(carried?.modifiers);
    const carriedShip = ships[id];
    ships[id] = {
      ...carriedShip,
      hp:
        carried?.hull === undefined
          ? carriedShip.hp
          : Math.min(carriedShip.maxHp, Math.max(1, Math.round(carried.hull))),
      ...(bonusDamage > 0 ? { bonusDamage } : {}),
    };
    const stats = shipType.tokens;
    players[participant.playerId] = {
      id: participant.playerId,
      name: participant.name ?? participant.playerId,
      teamId: participant.teamId,
      shipId: id,
      controller: participant.controller,
      aiDifficulty: participant.aiDifficulty ?? DEFAULT_AI_DIFFICULTY,
      tokens: cloneInventory(stats?.start ?? config.startingTokens),
      ammo:
        carried?.ammo === undefined
          ? (shipType.cannons?.ammo ?? config.startingAmmo)
          : Math.max(0, Math.round(carried.ammo)),
      queue: emptyQueue(),
      cannonQueue: emptyCannonQueue(),
      tokenGeneration: { auto: true, requested: 'FORWARD', rotationIndex: 0 },
      lockedIn: false,
    };
  }

  return {
    seed: config.seed,
    turn: 1,
    status: 'planning',
    board: createBoard(config.board.width, config.board.height),
    rules: config.rules,
    ships,
    obstacles,
    terrain: config.terrain ?? {},
    ...(config.pickups === undefined ? {} : { pickups: config.pickups }),
    ...(config.objective === undefined ? {} : { objective: config.objective }),
    ...(config.sea === undefined ? {} : { sea: config.sea }),
    players,
    outcome: null,
  };
}
