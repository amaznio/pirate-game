import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type { PlayerId, TeamId } from '../domain/Entity';
import type { TokenInventory } from '../domain/Action';
import type { ControllerKind } from '../domain/GameState';
import type { MatchRules } from '../domain/Rules';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CANNON_STARTING_AMMO,
  INITIAL_TOKEN_POOL,
  OBSTACLE_LAYOUT,
  TURN_DURATION_SECONDS,
} from './gameRules';

export interface SpawnConfig {
  readonly position: Position;
  readonly heading: Direction;
}

/** One player in a match and the ship they start with. */
export interface ParticipantConfig {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly shipTypeId: string;
  readonly spawn: SpawnConfig;
  readonly controller: ControllerKind;
}

export interface ObstacleConfig {
  readonly id: string;
  readonly kind: 'rock' | 'island';
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
  readonly participants: readonly ParticipantConfig[];
  readonly rules: MatchRules;
  readonly startingTokens: TokenInventory;
  readonly startingAmmo: number;
}

export const DEFAULT_RULES: MatchRules = {
  turnDurationSeconds: TURN_DURATION_SECONDS,
  friendlyFire: false,
  endTurnWhenAllLocked: true,
};

const DEFAULT_SHIP_TYPE = 'sloop';

/** The standard 1v1: you (bottom) against one AI (top) on the default board. */
export function createDuelConfig(
  overrides: Partial<Pick<MatchConfig, 'seed' | 'rules'>> = {},
): MatchConfig {
  return {
    seed: overrides.seed ?? 1,
    board: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    obstacles: OBSTACLE_LAYOUT,
    participants: [
      {
        playerId: 'player',
        teamId: 'player',
        shipTypeId: DEFAULT_SHIP_TYPE,
        spawn: { position: { x: 9, y: 14 }, heading: 'NORTH' },
        controller: 'human',
      },
      {
        playerId: 'enemy',
        teamId: 'enemy',
        shipTypeId: DEFAULT_SHIP_TYPE,
        spawn: { position: { x: 9, y: 5 }, heading: 'SOUTH' },
        controller: 'ai',
      },
    ],
    rules: overrides.rules ?? DEFAULT_RULES,
    startingTokens: INITIAL_TOKEN_POOL,
    startingAmmo: CANNON_STARTING_AMMO,
  };
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
    return {
      playerId,
      teamId:
        options.teamMode === 'teams'
          ? index % 2 === 0
            ? 'team-a'
            : 'team-b'
          : playerId,
      shipTypeId: DEFAULT_SHIP_TYPE,
      spawn,
      controller: index < options.humans ? 'human' : 'ai',
    };
  });

  const spawnCells = new Set(
    spawns.map((spawn) => `${spawn.position.x},${spawn.position.y}`),
  );
  const obstacles = OBSTACLE_LAYOUT.filter(
    (obstacle) =>
      obstacle.x < width &&
      obstacle.y < height &&
      !spawnCells.has(`${obstacle.x},${obstacle.y}`),
  );

  return {
    seed: options.seed ?? 1,
    board: { width, height },
    obstacles,
    participants,
    rules: options.rules ?? DEFAULT_RULES,
    startingTokens: INITIAL_TOKEN_POOL,
    startingAmmo: CANNON_STARTING_AMMO,
  };
}
