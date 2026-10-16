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
import type { Monster, MonsterMap } from '../domain/Monster';
import { getMonsterType } from '../config/monsterTypes';
import { planMonsterTurn } from './monsters';
import { cannonDamageBonus, carriedCannons, carriedMaxHull, reloadBonus } from '../domain/CarryOver';
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

/** What a ship has in place of its class's own hull and cannons (from a carry-over). */
export interface ShipOverrides {
  readonly maxHp?: number;
  readonly cannonsPerSide?: number;
}

export function createShip(
  id: EntityId,
  ownerId: PlayerId,
  teamId: TeamId,
  position: Position,
  heading: Direction,
  shipTypeId: string,
  overrides: ShipOverrides = {},
): Ship {
  const type = getShipType(shipTypeId);
  const maxHp = overrides.maxHp ?? type.maxHp;
  const cannonsPerSide = overrides.cannonsPerSide ?? cannonsPerSideOf(type);
  const weapons: WeaponMount[] = [];
  for (const weaponSide of BROADSIDE_ORDER) {
    const weaponTypeId = type.broadsides[weaponSide];
    if (weaponTypeId) {
      for (let i = 0; i < cannonsPerSide; i += 1) {
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
    hp: maxHp,
    maxHp,
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
    const carried = config.carryOver?.[participant.playerId];
    const maxHp = carriedMaxHull(carried?.maxHull);
    const cannonsPerSide = carriedCannons(carried?.cannonsPerSide);
    ships[id] = createShip(
      id,
      participant.playerId,
      participant.teamId,
      participant.spawn.position,
      participant.spawn.heading,
      participant.shipTypeId,
      {
        ...(maxHp === undefined ? {} : { maxHp }),
        ...(cannonsPerSide === undefined ? {} : { cannonsPerSide }),
      },
    );
    const shipType = getShipType(participant.shipTypeId);
    const bonusDamage = cannonDamageBonus(carried?.modifiers);
    const bonusReload = reloadBonus(carried?.modifiers);
    const carriedShip = ships[id];
    ships[id] = {
      ...carriedShip,
      hp:
        carried?.hull === undefined
          ? carriedShip.hp
          : Math.min(carriedShip.maxHp, Math.max(1, Math.round(carried.hull))),
      ...(bonusDamage > 0 ? { bonusDamage } : {}),
      ...(bonusReload > 0 ? { bonusReload } : {}),
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

  // Ships that arrive later wait off the board with no hull until their turn.
  for (const participant of config.participants) {
    if (participant.arrivesOnTurn !== undefined) {
      const id = shipIdFor(participant.playerId);
      ships[id] = { ...ships[id], hp: 0, arrivesOnTurn: participant.arrivesOnTurn };
    }
  }

  const monsters: Record<EntityId, Monster> = {};
  for (const spawn of config.monsters ?? []) {
    const type = getMonsterType(spawn.typeId);
    const boss =
      config.objective?.kind === 'hunt' && config.objective.bossId === spawn.id && type.boss !== undefined;
    const maxHp = spawn.maxHp ?? (boss ? type.boss!.maxHp : type.maxHp);
    monsters[spawn.id] = {
      id: spawn.id,
      kind: 'monster',
      monsterTypeId: spawn.typeId,
      position: { ...spawn.position },
      heading: spawn.heading,
      hp: maxHp,
      maxHp,
      ...(boss ? { boss: true as const } : {}),
      attacks: [],
    };
  }

  const state: GameState = {
    seed: config.seed,
    turn: 1,
    status: 'planning',
    board: createBoard(config.board.width, config.board.height),
    rules: config.rules,
    ships,
    obstacles,
    terrain: config.terrain ?? {},
    ...(config.pickups === undefined ? {} : { pickups: config.pickups }),
    ...(config.monsters === undefined || config.monsters.length === 0 ? {} : { monsters: monsters as MonsterMap }),
    ...(config.monsterWarnings ? { monsterWarnings: true } : {}),
    ...(config.objective === undefined ? {} : { objective: config.objective }),
    ...(config.sea === undefined ? {} : { sea: config.sea }),
    players,
    outcome: null,
  };
  // The monsters mark their first lashes before anyone plans turn 1.
  const planned = planMonsterTurn(state);
  return planned === undefined ? state : { ...state, monsters: planned };
}
