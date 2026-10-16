import type { Position } from '../domain/Position';
import type { PickupMap } from '../domain/Pickup';
import { monsterCells } from '../domain/Monster';
import { cellKey, type TerrainMap } from '../domain/Terrain';
import { getMonsterType } from '../config/monsterTypes';
import { createRng } from '../ai/rng';
import type { ObstacleConfig } from '../config/matchConfig';
import type { MonsterSpawn } from './generateMonsters';
import { generatePickups } from './generatePickups';

export interface GenerateTreasureOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Where the hero starts: some treasure lies safely near it. */
  readonly start: Position;
  /** How many rows deep the exit area is (along the bottom edge): no treasure there. */
  readonly exitDepth: number;
  readonly obstacles: readonly ObstacleConfig[];
  readonly terrain: TerrainMap;
  readonly monsters: readonly MonsterSpawn[];
  /** How many chests to place; plenty when left out. */
  readonly count?: number;
}

/** A chest on the cell of a safe stretch near the start, a spread one, and one a monster guards. */
const SAFE_VALUE = 1;
const SPREAD_VALUE = 2;
const GUARDED_VALUE = 3;

const DEFAULT_COUNT = 14;
const TRIES = 500;

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Scatters treasure chests over open water for a hunt: a few safely near the
 * start (a first taste), some spread across the board, and about a third
 * guarded close to the monsters, worth the most. Never on a rock, wind or
 * whirlpool, a monster's cell or the exit area, and never touching another
 * chest. Pure and deterministic from the seed, with its own random stream, so
 * treasure never changes the rocks, winds or monsters of a seed.
 */
export function generateTreasure(options: GenerateTreasureOptions): PickupMap {
  const { width, height, seed, start } = options;
  const count = options.count ?? DEFAULT_COUNT;
  const rng = createRng(seed, 0, 'treasure');
  const rocks = new Set(options.obstacles.map((o) => `${o.x},${o.y}`));
  const monsterCellList = options.monsters.flatMap((m) => monsterCells(m, getMonsterType(m.typeId).length));
  const blocked = new Set(monsterCellList.map(cellKey));

  const chests: Record<string, { kind: 'chest'; value: number }> = {};
  const placed: Position[] = [];

  const free = (cell: Position): boolean =>
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < width &&
    cell.y < height &&
    cell.y < height - options.exitDepth &&
    !rocks.has(`${cell.x},${cell.y}`) &&
    !options.terrain[cellKey(cell)] &&
    !blocked.has(cellKey(cell)) &&
    placed.every((other) => distance(other, cell) >= 2);

  const place = (value: number, wanted: (cell: Position) => boolean): void => {
    for (let tries = 0; tries < TRIES; tries += 1) {
      const cell = { x: Math.floor(rng() * width), y: Math.floor(rng() * height) };
      if (free(cell) && wanted(cell)) {
        chests[cellKey(cell)] = { kind: 'chest', value };
        placed.push(cell);
        return;
      }
    }
  };

  const safe = Math.min(3, Math.floor(count / 4));
  const guarded = Math.floor(count / 3);
  const spread = Math.max(0, count - safe - guarded);

  // Guarded: two to four cells from a monster's body, which is where the danger is.
  for (let n = 0; n < guarded; n += 1) {
    place(GUARDED_VALUE, (cell) => {
      const gap = Math.min(...monsterCellList.map((part) => distance(part, cell)));
      return gap >= 2 && gap <= 4;
    });
  }
  // Safe: a short way from the start, well away from every monster.
  for (let n = 0; n < safe; n += 1) {
    place(SAFE_VALUE, (cell) => {
      const near = distance(start, cell);
      return near >= 2 && near <= 5 && monsterCellList.every((part) => distance(part, cell) >= 5);
    });
  }
  // Spread: anywhere else.
  for (let n = 0; n < spread; n += 1) {
    place(SPREAD_VALUE, () => true);
  }
  return chests;
}

export interface GenerateHuntLootOptions extends GenerateTreasureOptions {
  /** Every ship start and the exit strip: loot keeps clear of them (as in any Loot match). */
  readonly spawns: readonly Position[];
  /** Chests already placed: loot never shares a cell with one. */
  readonly chests: PickupMap;
  /** How many barrels, crates and planks to keep; a few when left out. */
  readonly count?: number;
}

const DEFAULT_LOOT_COUNT = 6;

/**
 * The ordinary pickups of a hunt (barrels of cannonballs, crates of tokens, planks
 * for the hull), scattered like any Loot match does, so a long hunt can refill. They
 * use the Loot generator and its own random stream, then drop any that would sit on a
 * chest, a monster, or in the exit area, and keep the first few. Pure and
 * deterministic from the seed, and it never changes the rocks, winds, monsters or
 * chests of a seed.
 */
export function generateHuntLoot(options: GenerateHuntLootOptions): PickupMap {
  const count = options.count ?? DEFAULT_LOOT_COUNT;
  const monsterCellKeys = new Set(
    options.monsters.flatMap((m) => monsterCells(m, getMonsterType(m.typeId).length)).map(cellKey),
  );
  // Ask for more than wanted: some will be dropped below.
  const scattered = generatePickups({
    width: options.width,
    height: options.height,
    seed: options.seed,
    spawns: options.spawns,
    obstacles: options.obstacles,
    terrain: options.terrain,
    count: count + 4,
  });
  const loot: Record<string, PickupMap[string]> = {};
  for (const [key, pickup] of Object.entries(scattered)) {
    const [, y] = key.split(',').map(Number);
    if (
      Object.keys(loot).length < count &&
      options.chests[key] === undefined &&
      !monsterCellKeys.has(key) &&
      y < options.height - options.exitDepth
    ) {
      loot[key] = pickup;
    }
  }
  return loot;
}
