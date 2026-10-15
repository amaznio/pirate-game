import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type { PlayerId, TeamId } from '../domain/Entity';
import type { TokenInventory } from '../domain/Action';
import {
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
  type ControllerKind,
} from '../domain/GameState';
import type { MatchRules } from '../domain/Rules';
import type { TerrainMap } from '../domain/Terrain';
import type { PickupMap } from '../domain/Pickup';
import type { CarryOver } from '../domain/CarryOver';
import { generateMonsters, type MonsterSpawn } from '../board/generateMonsters';
import { generateTreasure } from '../board/generateTreasure';
import type { MonsterTypeId } from '../domain/Monster';
import { SELECTABLE_MONSTER_TYPE_IDS } from './monsterTypes';
import {
  AMBUSH_TEAM_ID,
  ambushLayout,
  EXIT_DEPTH,
  HUNT_PLAYER_ID,
  ESCORT_TEAM_ID,
  MERCHANT_PLAYER_ID,
  MERCHANT_SHIP_ID,
  merchantRoute,
  salvagePickupCount,
  type Objective,
} from '../domain/Objective';
import {
  DEFAULT_MAP_STYLE,
  generateBoard,
  type SeaChoice,
} from '../board/generateBoard';
import { generatePickups } from '../board/generatePickups';
import { DEFAULT_SHIP_TYPE_ID, MERCHANT_SHIP_TYPE_ID, RAIDER_SHIP_TYPE_ID } from './shipTypes';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CANNON_STARTING_AMMO,
  INITIAL_TOKEN_POOL,
  TURN_DURATION_SECONDS,
} from './gameRules';

export interface SpawnConfig {
  readonly position: Position;
  readonly heading: Direction;
}

/** One player in a match and the ship they start with. */
export interface ParticipantConfig {
  readonly playerId: PlayerId;
  /** Display name. Defaults to the player id. */
  readonly name?: string;
  readonly teamId: TeamId;
  readonly shipTypeId: string;
  readonly spawn: SpawnConfig;
  readonly controller: ControllerKind;
  /** The turn this ship arrives at the start of; on the board from the start when absent. */
  readonly arrivesOnTurn?: number;
  /** How well an AI sails this ship. Defaults to normal. */
  readonly aiDifficulty?: AiDifficulty;
}

export interface ObstacleConfig {
  readonly id: string;
  readonly kind: 'rock';
  readonly x: number;
  readonly y: number;
}

/**
 * Everything needed to start a match. `createGame(config)` is the only thing
 * that turns this into a GameState, so scenarios are data: add a preset below
 * (or build a config at runtime) instead of editing the simulation.
 */
export interface MatchConfig {
  readonly seed: number;
  readonly board: { readonly width: number; readonly height: number };
  readonly obstacles: readonly ObstacleConfig[];
  /** Wind and whirlpool cells. Open water everywhere when left out. */
  readonly terrain?: TerrainMap;
  /** Barrels, crates and planks afloat at the start. None when left out. */
  readonly pickups?: PickupMap;
  /** The kind of sea the board was made for; shown in how the water looks. */
  readonly sea?: SeaChoice;
  /** Creatures on the water at the start. None when left out. */
  readonly monsters?: readonly MonsterSpawn[];
  /** Show players what the monsters will strike (hidden when left out). */
  readonly monsterWarnings?: boolean;
  readonly participants: readonly ParticipantConfig[];
  /** A way for the match to end besides last team standing. None when left out. */
  readonly objective?: Objective;
  /**
   * What each ship brings from earlier battles, by player id. Set only by code
   * that builds a match; nothing the players send can reach it. Nobody carries
   * anything when left out.
   */
  readonly carryOver?: Readonly<Record<string, CarryOver>>;
  readonly rules: MatchRules;
  readonly startingTokens: TokenInventory;
  readonly startingAmmo: number;
}

export const DEFAULT_RULES: MatchRules = {
  turnDurationSeconds: TURN_DURATION_SECONDS,
  friendlyFire: false,
  endTurnWhenAllLocked: true,
};


/**
 * The same AI difficulty for every ship in the match. Humans get it too: it is
 * what sails their ship if they go away.
 */
export function withAiDifficulty(
  config: MatchConfig,
  aiDifficulty: AiDifficulty,
): MatchConfig {
  return {
    ...config,
    participants: config.participants.map((participant) => ({
      ...participant,
      // The raiders of an ambush are caught off guard: a step below everyone else.
      aiDifficulty:
        participant.teamId === AMBUSH_TEAM_ID ? easierThan(aiDifficulty) : aiDifficulty,
    })),
  };
}

/** One skill level lower (easy stays easy). */
function easierThan(level: AiDifficulty): AiDifficulty {
  return level === 'hard' ? 'normal' : 'easy';
}

export type { SeaChoice };

/**
 * What the sea is like: a style gives a generated board (rocks, wind,
 * whirlpools) built from the match seed; `open` is empty water. The choice is
 * handed on (when one was made) so the picture of the sea can match it.
 */
function seaFor(
  width: number,
  height: number,
  seed: number,
  spawns: readonly Position[],
  sea: SeaChoice | undefined,
  loot = false,
  objective?: Objective,
): {
  obstacles: readonly ObstacleConfig[];
  terrain: TerrainMap;
  sea?: SeaChoice;
  pickups?: PickupMap;
} {
  const style = sea ?? DEFAULT_MAP_STYLE;
  const chosen = sea === undefined ? {} : { sea };
  const water =
    style === 'open'
      ? { obstacles: [] as ObstacleConfig[], terrain: {} as TerrainMap }
      : generateBoard({ width, height, seed, spawns, style });
  // A salvage race needs its own number of pickups, whether or not Loot is on.
  const count = objective?.kind === 'salvage' ? salvagePickupCount(objective.target) : undefined;
  if (!loot && count === undefined) {
    return { ...water, ...chosen };
  }
  const pickups = generatePickups({ width, height, seed, spawns, ...water, ...(count === undefined ? {} : { count, fair: true }) });
  return { ...water, ...chosen, pickups };
}

/** A monster placed on the water the sea was made of, when the match has one. */
function monstersFor(
  typeIds: readonly MonsterTypeId[] | undefined,
  width: number,
  height: number,
  seed: number,
  spawns: readonly Position[],
  water: { obstacles: readonly ObstacleConfig[]; terrain: TerrainMap },
): { monsters?: readonly MonsterSpawn[] } {
  if (!typeIds || typeIds.length === 0) {
    return {};
  }
  const monsters = generateMonsters({ width, height, seed, spawns, obstacles: water.obstacles, terrain: water.terrain, typeIds });
  return monsters.length === 0 ? {} : { monsters };
}

/** The merchant's start, when the match has a merchant objective (kept clear of rocks and hazards). */
function merchantSpawns(height: number, objective: Objective | undefined): Position[] {
  return objective?.kind === 'merchant' ? [merchantRoute(height).spawn] : [];
}

/** The extra damage each of the hero's cannons does in an ambush. */
export const AMBUSH_HERO_DAMAGE_BONUS = 1;

/** The cells an ambush's ships start on or arrive at, so the terrain keeps them clear. */
function ambushSpawns(
  width: number,
  height: number,
  hero: Position,
  ais: number,
  objective: Objective | undefined,
): Position[] {
  if (objective?.kind !== 'ambush') {
    return [];
  }
  const layout = ambushLayout(width, height, hero, ais);
  return [...layout.firstWave, ...layout.reinforcements].map((spot) => spot.position);
}

/**
 * For an ambush match: puts every AI ship on the raiders' side and round the
 * hero (hemming it in, facing it), and schedules more raiders of the same class
 * to arrive from the corners at the start of later turns. Any other match is
 * returned as it is.
 */
export function withAmbush(config: MatchConfig): MatchConfig {
  if (config.objective?.kind !== 'ambush') {
    return config;
  }
  const hero = config.participants.find((p) => p.controller === 'human') ?? config.participants[0];
  const ais = config.participants.filter((p) => p.controller === 'ai');
  const layout = ambushLayout(config.board.width, config.board.height, hero.spawn.position, ais.length);

  let placed = 0;
  const participants: ParticipantConfig[] = config.participants.map((participant) => {
    if (participant.controller !== 'ai') {
      return participant;
    }
    const spot = layout.firstWave[placed];
    placed += 1;
    return {
      ...participant,
      teamId: AMBUSH_TEAM_ID,
      shipTypeId: RAIDER_SHIP_TYPE_ID,
      ...(spot ? { spawn: { position: spot.position, heading: spot.heading } } : {}),
    };
  });
  const shipTypeId = RAIDER_SHIP_TYPE_ID;
  layout.reinforcements.forEach((spot, index) => {
    participants.push({
      playerId: `raider-${index + 1}`,
      name: `Raider ${index + 1}`,
      teamId: AMBUSH_TEAM_ID,
      shipTypeId,
      spawn: { position: spot.position, heading: spot.heading },
      controller: 'ai',
      arrivesOnTurn: spot.turn,
    });
  });
  // The hero is outnumbered, so it fights with a veteran captain's guns: +1 damage a
  // cannon (one hit sinks a raider). Set here, never from anything a player sends.
  const carried = config.carryOver?.[hero.playerId];
  const carryOver = {
    ...config.carryOver,
    [hero.playerId]: {
      ...carried,
      modifiers: [...(carried?.modifiers ?? []), { kind: 'cannonDamage' as const, bonus: AMBUSH_HERO_DAMAGE_BONUS }],
    },
  };
  return { ...config, participants, carryOver };
}

/**
 * For a merchant match: adds the merchant (an unarmed AI ship) and puts every AI
 * ship on its side, the escorts, so nobody on that side shoots at another. The
 * objective learns which ship is the merchant and which edge it is making for.
 * Any other match is returned as it is.
 */
export function withMerchant(config: MatchConfig): MatchConfig {
  const objective = config.objective;
  if (objective?.kind !== 'merchant') {
    return config;
  }
  const route = merchantRoute(config.board.height);
  const merchant: ParticipantConfig = {
    playerId: MERCHANT_PLAYER_ID,
    name: 'Merchant',
    teamId: ESCORT_TEAM_ID,
    shipTypeId: MERCHANT_SHIP_TYPE_ID,
    spawn: { position: route.spawn, heading: route.heading },
    controller: 'ai',
  };
  return {
    ...config,
    objective: { ...objective, shipId: MERCHANT_SHIP_ID, exit: route.exit },
    participants: [
      ...config.participants.map((participant) =>
        participant.controller === 'ai' ? { ...participant, teamId: ESCORT_TEAM_ID } : participant,
      ),
      merchant,
    ],
  };
}

export interface HuntOptions {
  readonly seed?: number;
  readonly sea?: SeaChoice;
  /** The hero's ship class; the sloop when left out. */
  readonly shipTypeId?: string;
  /** Which monsters share the water, the boss first; every kind (the giant squid as boss) when left out. */
  readonly monsters?: readonly MonsterTypeId[];
  /** Warn the hero which cells the monsters will strike (hidden when left out). */
  readonly monsterWarnings?: boolean;
  /** The boss's hull, in place of its kind's own (a voyage sets it per area). */
  readonly bossHull?: number;
  readonly rules?: MatchRules;
  readonly name?: string;
}

/** The monster that is the boss of a default hunt: the first one placed. */
export const HUNT_BOSS_ID = 'monster-1';

/**
 * A hunt: one hero ship against the sea monsters, with no enemy ship. The hero
 * starts just inside the south edge, beside the exit (the outer rows of that
 * edge, kept clear of rocks, wind and whirlpools), and the monsters lie out in
 * the water beyond, the boss among them. There is no turn limit: the hunt ends
 * when the hero leaves with what it carries or is sunk (see `Objective`).
 */
export function createHuntConfig(options: HuntOptions = {}): MatchConfig {
  const seed = options.seed ?? 1;
  const width = BOARD_WIDTH;
  const height = BOARD_HEIGHT;
  const start = { x: Math.floor(width / 2), y: height - 1 - EXIT_DEPTH };
  // Points along the exit edge make the generator keep that whole strip clear.
  const exitStrip = [0, 4, 8, 12, 16, width - 1].map((x) => ({ x, y: height - 1 }));
  const spawns = [start, ...exitStrip];

  const water = seaFor(width, height, seed, spawns, options.sea);
  const typeIds = options.monsters ?? ['giant-squid', ...SELECTABLE_MONSTER_TYPE_IDS.filter((id) => id !== 'giant-squid')];
  const placed = monstersFor(typeIds, width, height, seed, spawns, water);
  const monsters =
    options.bossHull === undefined || placed.monsters === undefined
      ? placed
      : {
          monsters: placed.monsters.map((spawn) =>
            spawn.id === HUNT_BOSS_ID ? { ...spawn, maxHp: Math.max(1, Math.floor(options.bossHull!)) } : spawn,
          ),
        };
  const pickups = generateTreasure({
    width,
    height,
    seed,
    start,
    exitDepth: EXIT_DEPTH,
    obstacles: water.obstacles,
    terrain: water.terrain,
    monsters: monsters.monsters ?? [],
  });

  return {
    seed,
    board: { width, height },
    ...water,
    ...monsters,
    pickups,
    ...(options.monsterWarnings ? { monsterWarnings: true } : {}),
    objective: { kind: 'hunt', exit: 'SOUTH', bossId: HUNT_BOSS_ID },
    participants: [
      {
        playerId: HUNT_PLAYER_ID,
        name: options.name ?? 'Player',
        teamId: 'player',
        shipTypeId: options.shipTypeId ?? DEFAULT_SHIP_TYPE_ID,
        spawn: { position: start, heading: 'NORTH' },
        controller: 'human',
      },
    ],
    rules: options.rules ?? DEFAULT_RULES,
    startingTokens: INITIAL_TOKEN_POOL,
    startingAmmo: CANNON_STARTING_AMMO,
  };
}

/** The ship type a participant sails: the one listed for their seat, else the sloop. */
function shipTypeFor(shipTypeIds: readonly string[] | undefined, index: number): string {
  return shipTypeIds?.[index] ?? DEFAULT_SHIP_TYPE_ID;
}

/** The standard 1v1: you (bottom) against one AI (top) on the default board. */
export function createDuelConfig(
  overrides: Partial<Pick<MatchConfig, 'seed' | 'rules'>> & {
    aiDifficulty?: AiDifficulty;
    sea?: SeaChoice;
    /** Float barrels, crates and planks on the water. */
    loot?: boolean;
    /** A way for the match to end besides last team standing. */
    objective?: Objective;
    /** The sea monsters on the water. */
    monsters?: readonly MonsterTypeId[];
    /** Warn players which cells the monster will strike. */
    monsterWarnings?: boolean;
    /** Ship types for [player, enemy]; sloops when left out. */
    shipTypeIds?: readonly string[];
  } = {},
): MatchConfig {
  const seed = overrides.seed ?? 1;
  const duelSpawns = [
    { x: 9, y: 14 },
    { x: 9, y: 5 },
  ];
  const allSpawns = [
    ...duelSpawns,
    ...merchantSpawns(BOARD_HEIGHT, overrides.objective),
    ...ambushSpawns(BOARD_WIDTH, BOARD_HEIGHT, duelSpawns[0], 1, overrides.objective),
  ];
  const water = seaFor(
    BOARD_WIDTH,
    BOARD_HEIGHT,
    seed,
    allSpawns,
    overrides.sea,
    overrides.loot,
    overrides.objective,
  );
  const config: MatchConfig = {
    seed,
    board: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    ...water,
    ...monstersFor(overrides.monsters, BOARD_WIDTH, BOARD_HEIGHT, seed, allSpawns, water),
    ...(overrides.monsters?.length && overrides.monsterWarnings ? { monsterWarnings: true } : {}),
    ...(overrides.objective === undefined ? {} : { objective: overrides.objective }),
    participants: [
      {
        playerId: 'player',
        name: 'Player',
        teamId: 'player',
        shipTypeId: shipTypeFor(overrides.shipTypeIds, 0),
        spawn: { position: { x: 9, y: 14 }, heading: 'NORTH' },
        controller: 'human',
      },
      {
        playerId: 'enemy',
        name: 'Enemy',
        teamId: 'enemy',
        shipTypeId: shipTypeFor(overrides.shipTypeIds, 1),
        spawn: { position: { x: 9, y: 5 }, heading: 'SOUTH' },
        controller: 'ai',
      },
    ],
    rules: overrides.rules ?? DEFAULT_RULES,
    startingTokens: INITIAL_TOKEN_POOL,
    startingAmmo: CANNON_STARTING_AMMO,
  };
  return withAiDifficulty(withAmbush(withMerchant(config)), overrides.aiDifficulty ?? DEFAULT_AI_DIFFICULTY);
}

export interface SkirmishOptions {
  readonly humans: number;
  readonly ais: number;
  /** `ffa`: everyone for themselves. `teams`: players alternate between two teams. */
  readonly teamMode: 'ffa' | 'teams';
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly rules?: MatchRules;
  /** How well the AIs play (and what sails a human's ship while they are away). */
  readonly aiDifficulty?: AiDifficulty;
  /** The kind of sea to generate from the seed. Normal when left out. */
  readonly sea?: SeaChoice;
  /** Float barrels, crates and planks on the water (off when left out). */
  readonly loot?: boolean;
  /** A way for the match to end besides last team standing. None when left out. */
  readonly objective?: Objective;
  /** The sea monsters on the water (none when left out). */
  readonly monsters?: readonly MonsterTypeId[];
  /** Warn players which cells the monster will strike (hidden when left out). */
  readonly monsterWarnings?: boolean;
  /** Ship types in seat order (humans first); sloops when left out. */
  readonly shipTypeIds?: readonly string[];
}

/** Cells in from the board edge where generated spawns are placed. */
const SPAWN_INSET = 3;

/**
 * Spreads `count` spawn points evenly around a ring inside the board, each
 * facing the centre. The first spawn is bottom-centre (so a 1v1 matches the
 * classic layout). Pure and deterministic.
 */
export function generateSpawns(
  width: number,
  height: number,
  count: number,
): SpawnConfig[] {
  const x0 = SPAWN_INSET;
  const y0 = SPAWN_INSET;
  const x1 = width - 1 - SPAWN_INSET;
  const y1 = height - 1 - SPAWN_INSET;
  if (x1 <= x0 || y1 <= y0) {
    throw new Error(`Board ${width}x${height} is too small to place ships`);
  }

  const cx = Math.round((x0 + x1) / 2);
  const centre = { x: (width - 1) / 2, y: (height - 1) / 2 };

  // Clockwise loop starting at bottom-centre.
  const corners: Position[] = [
    { x: cx, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: cx, y: y1 },
  ];
  const lengths = corners
    .slice(1)
    .map(
      (corner, index) =>
        Math.abs(corner.x - corners[index].x) +
        Math.abs(corner.y - corners[index].y),
    );
  const perimeter = lengths.reduce((total, length) => total + length, 0);

  const pointAt = (distance: number): Position => {
    let remaining = distance;
    for (let i = 0; i < lengths.length; i += 1) {
      if (remaining <= lengths[i]) {
        const from = corners[i];
        const to = corners[i + 1];
        const t = lengths[i] === 0 ? 0 : remaining / lengths[i];
        return {
          x: Math.round(from.x + (to.x - from.x) * t),
          y: Math.round(from.y + (to.y - from.y) * t),
        };
      }
      remaining -= lengths[i];
    }
    return corners[0];
  };

  const spawns: SpawnConfig[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const position = pointAt((perimeter * i) / count);
    const key = `${position.x},${position.y}`;
    if (used.has(key)) {
      throw new Error(`Board ${width}x${height} is too small for ${count} ships`);
    }
    used.add(key);

    const dx = centre.x - position.x;
    const dy = centre.y - position.y;
    const heading: Direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'EAST'
          : 'WEST'
        : dy > 0
          ? 'SOUTH'
          : 'NORTH';
    spawns.push({ position, heading });
  }
  return spawns;
}

/**
 * A configurable many-ship match: any number of humans and AIs, free-for-all or
 * two teams, on any board size. The first participants are the humans.
 */
export function createSkirmishConfig(options: SkirmishOptions): MatchConfig {
  const width = options.width ?? BOARD_WIDTH;
  const height = options.height ?? BOARD_HEIGHT;
  const total = options.humans + options.ais;
  const spawns = generateSpawns(width, height, total);

  const participants: ParticipantConfig[] = spawns.map((spawn, index) => {
    const playerId = `p${index + 1}`;
    const controller = index < options.humans ? 'human' : 'ai';
    return {
      playerId,
      name: `${controller === 'human' ? 'Player' : 'Bot'} ${index + 1}`,
      teamId:
        options.teamMode === 'teams'
          ? index % 2 === 0
            ? 'team-a'
            : 'team-b'
          : playerId,
      shipTypeId: shipTypeFor(options.shipTypeIds, index),
      spawn,
      controller,
    };
  });

  const seed = options.seed ?? 1;
  const allSpawns = [
    ...spawns.map((spawn) => spawn.position),
    ...merchantSpawns(height, options.objective),
    ...ambushSpawns(width, height, spawns[0].position, options.ais, options.objective),
  ];
  const sea = seaFor(width, height, seed, allSpawns, options.sea, options.loot, options.objective);

  return withAiDifficulty(
    withAmbush(withMerchant({
      seed,
      board: { width, height },
      ...sea,
      ...monstersFor(options.monsters, width, height, seed, allSpawns, sea),
      ...(options.monsters?.length && options.monsterWarnings ? { monsterWarnings: true } : {}),
      ...(options.objective === undefined ? {} : { objective: options.objective }),
      participants,
      rules: options.rules ?? DEFAULT_RULES,
      startingTokens: INITIAL_TOKEN_POOL,
      startingAmmo: CANNON_STARTING_AMMO,
    })),
    options.aiDifficulty ?? DEFAULT_AI_DIFFICULTY,
  );
}
