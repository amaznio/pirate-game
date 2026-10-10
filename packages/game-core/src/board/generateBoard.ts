import type { Position } from '../domain/Position';
import { DIRECTIONS, vectorFor, type Direction } from '../domain/Direction';
import {
  cellKey,
  terrainFrom,
  whirlpoolCells,
  windLane,
  type Spin,
  type TerrainMap,
} from '../domain/Terrain';
import { createRng } from '../ai/rng';
import type { ObstacleConfig } from '../config/matchConfig';

/** How rough the water is: how many rocks, winds and whirlpools a board has. */
export type MapStyle = 'calm' | 'normal' | 'stormy';

export const MAP_STYLES: readonly MapStyle[] = ['calm', 'normal', 'stormy'];

export const DEFAULT_MAP_STYLE: MapStyle = 'normal';

export interface BoardProfile {
  /** Share of the board covered by rock, before clean-up. */
  readonly rockDensity: number;
  /** Lanes of wind and whirlpools on a 20x20 board (scaled with the area). */
  readonly windLanes: readonly [number, number];
  readonly whirlpools: readonly [number, number];
}

export const MAP_PROFILES: Record<MapStyle, BoardProfile> = {
  calm: { rockDensity: 0.05, windLanes: [1, 2], whirlpools: [0, 1] },
  normal: { rockDensity: 0.08, windLanes: [2, 4], whirlpools: [1, 2] },
  stormy: { rockDensity: 0.1, windLanes: [4, 6], whirlpools: [2, 3] },
};

export interface GenerateBoardOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Every ship's starting cell: kept clear of rocks and hazards. */
  readonly spawns: readonly Position[];
  readonly style?: MapStyle;
}

export interface GeneratedBoard {
  readonly obstacles: ObstacleConfig[];
  readonly terrain: TerrainMap;
}

/** Cells around a spawn (Chebyshev distance) that stay free of rocks. */
const ROCK_CLEARANCE = 2;
/** ...and of wind. Whirlpools keep further away still. */
const WIND_CLEARANCE = 2;
const WHIRLPOOL_CLEARANCE = 3;
const LANE_LENGTH: readonly [number, number] = [2, 5];
const PLACEMENT_TRIES = 60;
const BOARD_ATTEMPTS = 12;
const MIN_OPEN_SHARE = 0.8;

type Rng = () => number;

function between(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Smooth value noise: random values on a coarse lattice, blended between. */
function valueNoise(
  rng: Rng,
  width: number,
  height: number,
  scale: number,
): (x: number, y: number) => number {
  const cols = Math.ceil(width / scale) + 2;
  const rows = Math.ceil(height / scale) + 2;
  const lattice = Array.from({ length: cols * rows }, () => rng());
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const at = (cx: number, cy: number): number => lattice[cy * cols + cx];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

class Grid {
  readonly rock: boolean[];
  readonly taken: Set<string> = new Set();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.rock = new Array<boolean>(width * height).fill(false);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isRock(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.rock[y * this.width + x];
  }

  setRock(x: number, y: number): void {
    this.rock[y * this.width + x] = true;
  }

  /** Off the board counts as blocked, like a rock. */
  isBlocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.isRock(x, y);
  }
}

function nearAny(
  x: number,
  y: number,
  points: readonly Position[],
  distance: number,
): boolean {
  return points.some(
    (point) => Math.max(Math.abs(point.x - x), Math.abs(point.y - y)) <= distance,
  );
}

/** Whether any cell within one step (diagonals too) holds terrain already. */
function touchesTerrain(grid: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (grid.taken.has(`${x + dx},${y + dy}`)) {
        return true;
      }
    }
  }
  return false;
}

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Rocks: the cells where smooth noise is highest, so they gather in reefs and
 * ridges rather than lying about at random. Then the board is tidied so ships
 * never get trapped: dead-end nooks are filled and cut-off pockets are closed.
 * Returns false if a spawn ended up cut off (the caller tries another seed).
 */
function placeRocks(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  density: number,
): boolean {
  const { width, height } = grid;
  const broad = valueNoise(rng, width, height, 5);
  const fine = valueNoise(rng, width, height, 2.5);

  const candidates: Array<{ x: number; y: number; value: number }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!nearAny(x, y, spawns, ROCK_CLEARANCE)) {
        candidates.push({
          x,
          y,
          value: 0.65 * broad(x, y) + 0.35 * fine(x, y),
        });
      }
    }
  }
  candidates.sort((a, b) => b.value - a.value || a.y - b.y || a.x - b.x);
  const count = Math.round(density * width * height);
  for (const cell of candidates.slice(0, count)) {
    grid.setRock(cell.x, cell.y);
  }

  // Fill nooks that are walled in on three sides.
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (grid.isRock(x, y) || nearAny(x, y, spawns, ROCK_CLEARANCE)) {
          continue;
        }
        const walls = ORTHOGONAL.filter(([dx, dy]) =>
          grid.isBlocked(x + dx, y + dy),
        ).length;
        if (walls >= 3) {
          grid.setRock(x, y);
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  // Everything open must be one connected stretch of water.
  const component = new Array<number>(width * height).fill(-1);
  const sizes: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid.isRock(x, y) || component[y * width + x] !== -1) {
        continue;
      }
      const id = sizes.length;
      let size = 0;
      const stack: Array<[number, number]> = [[x, y]];
      component[y * width + x] = id;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number];
        size += 1;
        for (const [dx, dy] of ORTHOGONAL) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (
            grid.inBounds(nx, ny) &&
            !grid.isRock(nx, ny) &&
            component[ny * width + nx] === -1
          ) {
            component[ny * width + nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      sizes.push(size);
    }
  }
  const largest = sizes.indexOf(Math.max(...sizes));
  for (const spawn of spawns) {
    if (component[spawn.y * width + spawn.x] !== largest) {
      return false;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!grid.isRock(x, y) && component[y * width + x] !== largest) {
        grid.setRock(x, y);
      }
    }
  }

  const rocks = grid.rock.filter(Boolean).length;
  return 1 - rocks / (width * height) >= MIN_OPEN_SHARE;
}

/**
 * Wind: straight lanes. All the lanes of a board lean the same general way
 * (the direction comes from a smooth noise field), which reads as one weather
 * system. A lane never touches other terrain, never starts next to a ship, and
 * never ends by blowing into a rock or off the board, so no wind ever circles.
 */
function placeWind(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  lanes: number,
): TerrainMap {
  const flow = valueNoise(rng, grid.width, grid.height, 9);
  const placed: Array<ReturnType<typeof windLane>> = [];

  for (let lane = 0; lane < lanes; lane += 1) {
    for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt += 1) {
      const x = between(rng, 0, grid.width - 1);
      const y = between(rng, 0, grid.height - 1);
      const direction: Direction =
        DIRECTIONS[Math.min(3, Math.floor(flow(x, y) * 4))];
      const length = between(rng, LANE_LENGTH[0], LANE_LENGTH[1]);
      const cells = windLane({ x, y }, direction, length);

      const delta = vectorFor(direction);
      const last = cells[cells.length - 1].position;
      const beyond = { x: last.x + delta.x, y: last.y + delta.y };

      const fits =
        cells.every(
          ({ position }) =>
            grid.inBounds(position.x, position.y) &&
            !grid.isRock(position.x, position.y) &&
            !nearAny(position.x, position.y, spawns, WIND_CLEARANCE) &&
            !touchesTerrain(grid, position.x, position.y),
        ) &&
        !grid.isBlocked(beyond.x, beyond.y) &&
        !touchesTerrain(grid, beyond.x, beyond.y);
      if (fits) {
        for (const { position } of cells) {
          grid.taken.add(cellKey(position));
        }
        placed.push(cells);
        break;
      }
    }
  }
  return terrainFrom(...placed);
}

/**
 * Whirlpools: 2x2 vortices with open water all round, so a ship can always
 * sail out of one, kept well away from the starting positions.
 */
function placeWhirlpools(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  count: number,
): TerrainMap {
  const placed: Array<ReturnType<typeof whirlpoolCells>> = [];

  for (let n = 0; n < count; n += 1) {
    for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt += 1) {
      const x = between(rng, 1, grid.width - 3);
      const y = between(rng, 1, grid.height - 3);
      const spin: Spin = rng() < 0.5 ? 'left' : 'right';
      const cells = whirlpoolCells({ x, y }, spin);

      let fits = true;
      for (let dy = -1; dy <= 2 && fits; dy += 1) {
        for (let dx = -1; dx <= 2 && fits; dx += 1) {
          const cx = x + dx;
          const cy = y + dy;
          const inside = dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1;
          if (
            grid.isRock(cx, cy) ||
            (inside && !grid.inBounds(cx, cy)) ||
            grid.taken.has(`${cx},${cy}`) ||
            (inside && nearAny(cx, cy, spawns, WHIRLPOOL_CLEARANCE))
          ) {
            fits = false;
          }
        }
      }
      if (fits) {
        for (const { position } of cells) {
          grid.taken.add(cellKey(position));
        }
        placed.push(cells);
        break;
      }
    }
  }
  return terrainFrom(...placed);
}

function scaled(range: readonly [number, number], area: number): [number, number] {
  const factor = area / 400;
  return [Math.round(range[0] * factor), Math.max(1, Math.round(range[1] * factor))];
}

/**
 * Builds a board from a seed: rocks, wind and whirlpools. Pure and
 * deterministic, so the same seed gives the same board on every machine, which
 * is what lets a server and its clients (or a replay) agree on the water.
 */
export function generateBoard(options: GenerateBoardOptions): GeneratedBoard {
  const { width, height, seed, spawns } = options;
  const profile = MAP_PROFILES[options.style ?? DEFAULT_MAP_STYLE];

  for (let attempt = 0; attempt < BOARD_ATTEMPTS; attempt += 1) {
    const rng = createRng(seed, attempt, 'board');
    const grid = new Grid(width, height);
    if (!placeRocks(grid, rng, spawns, profile.rockDensity)) {
      continue;
    }

    const area = width * height;
    const [windMin, windMax] = scaled(profile.windLanes, area);
    const [poolMin, poolMax] = scaled(profile.whirlpools, area);
    const wind = placeWind(grid, rng, spawns, between(rng, windMin, windMax));
    const whirlpools = placeWhirlpools(
      grid,
      rng,
      spawns,
      between(rng, poolMin, poolMax),
    );

    const obstacles: ObstacleConfig[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (grid.isRock(x, y)) {
          obstacles.push({ id: `rock-${obstacles.length + 1}`, kind: 'rock', x, y });
        }
      }
    }
    return { obstacles, terrain: { ...wind, ...whirlpools } };
  }

  // No seed gave a sound board (a tiny or crowded one): open water.
  return { obstacles: [], terrain: {} };
}

/** A text picture of a board, for tests and debugging. */
export function describeBoard(
  width: number,
  height: number,
  board: GeneratedBoard,
  spawns: readonly Position[] = [],
): string {
  const rocks = new Set(board.obstacles.map((o) => `${o.x},${o.y}`));
  const wind: Record<Direction, string> = {
    NORTH: '^',
    EAST: '>',
    SOUTH: 'v',
    WEST: '<',
  };
  const lines: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${y}`;
      const terrain = board.terrain[key];
      if (spawns.some((spawn) => spawn.x === x && spawn.y === y)) {
        line += 'S';
      } else if (rocks.has(key)) {
        line += '#';
      } else if (terrain?.kind === 'wind') {
        line += wind[terrain.direction];
      } else if (terrain?.kind === 'whirlpool') {
        line += terrain.spin === 'right' ? '@' : 'O';
      } else {
        line += '.';
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}
