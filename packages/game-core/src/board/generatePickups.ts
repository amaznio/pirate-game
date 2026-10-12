import type { Position } from '../domain/Position';
import { PICKUP_KINDS, type Pickup, type PickupKind, type PickupMap } from '../domain/Pickup';
import { cellKey, type TerrainMap } from '../domain/Terrain';
import { createRng } from '../ai/rng';
import { PICKUP_COUNT } from '../config/gameRules';
import type { ObstacleConfig } from '../config/matchConfig';

export interface GeneratePickupsOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Every ship's starting cell: pickups stay clear of them. */
  readonly spawns: readonly Position[];
  readonly obstacles: readonly ObstacleConfig[];
  readonly terrain: TerrainMap;
  /** How many to place; a few, scaled with the board, when left out. */
  readonly count?: number;
}

/** Cells around a spawn (Chebyshev distance) that hold no pickup. */
const SPAWN_CLEARANCE = 2;
/** Closest two pickups may sit (Chebyshev distance). */
const SPACING = 3;
const TRIES = 200;

function between(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Scatters barrels, crates and planks over open water: never on a rock, wind
 * or whirlpool, never near a spawn, spaced apart, and likelier towards the
 * middle than the edges (a reason to leave the safe waters). Pure and
 * deterministic from the seed, with its own random stream, so turning Loot on
 * never changes the rocks, winds and whirlpools of a seed.
 */
export function generatePickups(options: GeneratePickupsOptions): PickupMap {
  const { width, height, seed, spawns } = options;
  const rng = createRng(seed, 0, 'loot');
  const rocks = new Set(options.obstacles.map((o) => `${o.x},${o.y}`));
  const centre = { x: (width - 1) / 2, y: (height - 1) / 2 };
  const reach = Math.max(centre.x, centre.y);

  const [min, max] = PICKUP_COUNT;
  const wanted = options.count ?? Math.round(between(rng, min, max) * (width * height) / 400);

  const placed: Position[] = [];
  const pickups: Record<string, Pickup> = {};
  for (let n = 0; n < wanted; n += 1) {
    // The first three are one of each kind; after that it is a free choice.
    const kind: PickupKind =
      n < PICKUP_KINDS.length ? PICKUP_KINDS[n] : PICKUP_KINDS[between(rng, 0, PICKUP_KINDS.length - 1)];

    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const position = { x: between(rng, 0, width - 1), y: between(rng, 0, height - 1) };
      const key = cellKey(position);
      if (
        rocks.has(key) ||
        options.terrain[key] ||
        spawns.some((spawn) => distance(spawn, position) <= SPAWN_CLEARANCE) ||
        placed.some((other) => distance(other, position) < SPACING)
      ) {
        continue;
      }
      const fromCentre = Math.hypot(position.x - centre.x, position.y - centre.y) / (reach * 1.4);
      if (rng() < fromCentre) {
        continue; // the further out, the likelier to be turned away
      }
      placed.push(position);
      pickups[key] = { kind };
      break;
    }
  }
  return pickups;
}
