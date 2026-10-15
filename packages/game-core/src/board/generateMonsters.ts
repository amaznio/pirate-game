import type { Direction } from '../domain/Direction';
import { DIRECTIONS } from '../domain/Direction';
import type { MonsterTypeId } from '../domain/Monster';
import { monsterCells } from '../domain/Monster';
import type { Position } from '../domain/Position';
import { cellKey, type TerrainMap } from '../domain/Terrain';
import { createRng } from '../ai/rng';
import { getMonsterType } from '../config/monsterTypes';
import type { ObstacleConfig } from '../config/matchConfig';

export interface MonsterSpawn {
  readonly id: string;
  readonly typeId: MonsterTypeId;
  /** The stern cell; the body continues along `heading`. */
  readonly position: Position;
  readonly heading: Direction;
}

export interface GenerateMonstersOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Every ship's starting cell: a monster stays well clear of them. */
  readonly spawns: readonly Position[];
  readonly obstacles: readonly ObstacleConfig[];
  readonly terrain: TerrainMap;
  /** Which monsters to place, in order; the giant squid alone when left out. */
  readonly typeIds?: readonly MonsterTypeId[];
}

/** Closest a monster's body may sit to a ship's start (Chebyshev distance). */
const SPAWN_CLEARANCE = 4;
const TRIES = 600;

/** How hard to look for room: first towards the middle with water to spare, then anywhere it fits. */
const ATTEMPTS = [
  { clearance: SPAWN_CLEARANCE, breathingRoom: 1, middle: true, apart: 2 },
  { clearance: SPAWN_CLEARANCE, breathingRoom: 0, middle: true, apart: 2 },
  { clearance: 3, breathingRoom: 0, middle: false, apart: 1 },
] as const;

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Places each monster on open water, one after another: preferably towards the
 * middle of the board with free water round it, never on a rock, wind or
 * whirlpool, never near a ship's start and never touching another monster. If
 * the sea is too crowded for that, it looks again with less room to spare, then
 * anywhere. Pure and deterministic from the seed, with its own random stream, so a
 * monster never changes the rocks, winds or loot of a seed. A monster that finds no
 * room at all is left out.
 */
export function generateMonsters(options: GenerateMonstersOptions): MonsterSpawn[] {
  const { width, height, seed, spawns } = options;
  const rng = createRng(seed, 0, 'monster');
  const rocks = new Set(options.obstacles.map((o) => `${o.x},${o.y}`));
  const placed: MonsterSpawn[] = [];
  const taken: Position[] = [];

  (options.typeIds ?? ['giant-squid']).forEach((typeId, index) => {
    const type = getMonsterType(typeId);
    for (const attempt of ATTEMPTS) {
      for (let tries = 0; tries < TRIES; tries += 1) {
        const x = attempt.middle ? Math.floor(width / 3 + rng() * (width / 3)) : Math.floor(rng() * width);
        const y = attempt.middle ? Math.floor(height / 3 + rng() * (height / 3)) : Math.floor(rng() * height);
        const heading = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
        const body = monsterCells({ position: { x, y }, heading }, type.length);

        const fits = body.every((cell) => {
          if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) {
            return false;
          }
          if (spawns.some((spawn) => distance(spawn, cell) < attempt.clearance)) {
            return false;
          }
          if (taken.some((other) => distance(other, cell) < attempt.apart)) {
            return false;
          }
          for (let dy = -attempt.breathingRoom; dy <= attempt.breathingRoom; dy += 1) {
            for (let dx = -attempt.breathingRoom; dx <= attempt.breathingRoom; dx += 1) {
              const near = { x: cell.x + dx, y: cell.y + dy };
              if (rocks.has(`${near.x},${near.y}`) || options.terrain[cellKey(near)]) {
                return false;
              }
            }
          }
          return true;
        });
        if (fits) {
          placed.push({ id: `monster-${index + 1}`, typeId, position: { x, y }, heading });
          taken.push(...body);
          return;
        }
      }
    }
  });
  return placed;
}
