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
  /** Which formation each rock belongs to (-1 for none). */
  readonly formation: number[];
  readonly taken: Set<string> = new Set();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.rock = new Array<boolean>(width * height).fill(false);
    this.formation = new Array<number>(width * height).fill(-1);
  }

  formationAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.formation[y * this.width + x] : -1;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isRock(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.rock[y * this.width + x];
  }

  setRock(x: number, y: number, formation = -1): void {
    this.rock[y * this.width + x] = true;
    this.formation[y * this.width + x] = formation;
  }

  clearRock(x: number, y: number): void {
    this.rock[y * this.width + x] = false;
    this.formation[y * this.width + x] = -1;
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

/** The eight cells around a cell. */
const EIGHT: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/**
 * How many cells a clump of rock has, as weighted choices: small clumps up to a
 * 2x2 or 2x3. Anything bigger as a solid mass starts to look like a block
 * rather than something the sea left behind (long thin ridges are separate).
 */
const CLUMP_SIZES: ReadonlyArray<readonly [size: number, weight: number]> = [
  [1, 34],
  [2, 24],
  [3, 14],
  [4, 14],
  [5, 6],
  [6, 8],
];
/** What share of the rocks laid are single stones, small clumps and ridges (the rest). */
const SINGLE_SHARE = 0.22;
const CLUMP_SHARE = 0.28;
/** A clump always fits in a 2x3 (or 3x2) box. */
const CLUMP_LONG = 3;
const CLUMP_SHORT = 2;
const FORMATION_ATTEMPTS = 320;

/** Whether all open water is still one connected piece (ships turn corners, not squeeze through diagonals). */
function waterIsConnected(grid: Grid): boolean {
  const { width, height } = grid;
  let open = 0;
  let start = -1;
  for (let i = 0; i < width * height; i += 1) {
    if (!grid.rock[i]) {
      open += 1;
      if (start === -1) {
        start = i;
      }
    }
  }
  if (open === 0) {
    return true;
  }
  const seen = new Uint8Array(width * height);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length > 0) {
    const cell = stack.pop() as number;
    reached += 1;
    const cx = cell % width;
    const cy = (cell - cx) / width;
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const next = ny * width + nx;
      if (!grid.rock[next] && !seen[next]) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return reached === open;
}

/**
 * Whether a rock can go at (x, y) as part of `formation`. A formation never
 * touches another one (so clumps stay separate islets of rock with water
 * between), never walls a cell of water in on three sides, and never cuts water off.
 */
function canPlaceRock(
  grid: Grid,
  spawns: readonly Position[],
  x: number,
  y: number,
  formation: number,
  ridge = false,
): boolean {
  if (
    !grid.inBounds(x, y) ||
    grid.isRock(x, y) ||
    nearAny(x, y, spawns, ROCK_CLEARANCE)
  ) {
    return false;
  }
  for (const [dx, dy] of EIGHT) {
    const other = grid.formationAt(x + dx, y + dy);
    if (other !== -1 && other !== formation) {
      return false;
    }
  }

  // A ridge stays a line: it never fills in a solid 2x2 block.
  if (ridge) {
    for (const [sx, sy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      const block = [
        [x + sx, y + sy],
        [x + sx + 1, y + sy],
        [x + sx, y + sy + 1],
        [x + sx + 1, y + sy + 1],
      ];
      if (block.every(([cx, cy]) => (cx === x && cy === y) || grid.isRock(cx, cy))) {
        return false;
      }
    }
  }

  // Would a neighbouring cell of water end up walled in on three sides?
  grid.setRock(x, y, formation);
  let nook = false;
  for (const [dx, dy] of ORTHOGONAL) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny) || grid.isRock(nx, ny)) {
      continue;
    }
    const walls = ORTHOGONAL.filter(([ox, oy]) =>
      grid.isBlocked(nx + ox, ny + oy),
    ).length;
    if (walls >= 3) {
      nook = true;
    }
  }
  // ...or cut a stretch of water off from the rest?
  const connected = !nook && waterIsConnected(grid);
  grid.clearRock(x, y);
  return !nook && connected;
}

/** How long a ridge is, in cells. */
const RIDGE_LENGTH: readonly [number, number] = [3, 8];

/**
 * Grows a ridge from `start`: a winding line of rock that mostly keeps its
 * heading and now and then bends a step to one side, which gives the diagonals
 * and elbows of a real reef. It stops when it runs into something it may not
 * touch. Returns how many cells it placed.
 */
function growRun(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  start: Position,
  heading: number,
  length: number,
  formation: number,
): number {
  let placed = 0;
  let x = start.x;
  let y = start.y;
  let run = heading;
  for (let step = 0; step < length; step += 1) {
    let bend = 0;
    if (rng() < 0.5) {
      bend = rng() < 0.5 ? 1 : -1;
    }
    let moved = false;
    for (const turn of [bend, -bend, bend === 0 ? 1 : 0]) {
      const candidate = (run + turn + 8) % 8;
      const nx = x + EIGHT[candidate][0];
      const ny = y + EIGHT[candidate][1];
      if (canPlaceRock(grid, spawns, nx, ny, formation, true)) {
        grid.setRock(nx, ny, formation);
        x = nx;
        y = ny;
        run = candidate;
        placed += 1;
        moved = true;
        break;
      }
    }
    if (!moved) {
      break;
    }
  }
  return placed;
}

/** A random clump size from CLUMP_SIZES. */
function clumpSize(rng: Rng): number {
  const total = CLUMP_SIZES.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [size, weight] of CLUMP_SIZES) {
    roll -= weight;
    if (roll < 0) {
      return size;
    }
  }
  return 1;
}

/**
 * Grows a small clump of rock from `start` by adding neighbouring cells one at
 * a time, as long as the clump still fits in a 2x3 box and every new cell is
 * allowed. Returns how many cells it placed besides the start.
 */
function growClump(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  start: Position,
  size: number,
  formation: number,
): number {
  const cells: Position[] = [start];
  let minX = start.x;
  let maxX = start.x;
  let minY = start.y;
  let maxY = start.y;

  for (let tries = 0; tries < 24 && cells.length < size; tries += 1) {
    const from = cells[Math.floor(rng() * cells.length)];
    // Mostly straight neighbours; a diagonal one now and then.
    const [dx, dy] = rng() < 0.75
      ? EIGHT[Math.floor(rng() * 4) * 2]
      : EIGHT[Math.floor(rng() * 4) * 2 + 1];
    const x = from.x + dx;
    const y = from.y + dy;

    const width = Math.max(maxX, x) - Math.min(minX, x) + 1;
    const height = Math.max(maxY, y) - Math.min(minY, y) + 1;
    const fits =
      (width <= CLUMP_LONG && height <= CLUMP_SHORT) ||
      (width <= CLUMP_SHORT && height <= CLUMP_LONG);
    if (!fits || !canPlaceRock(grid, spawns, x, y, formation)) {
      continue;
    }

    grid.setRock(x, y, formation);
    cells.push({ x, y });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return cells.length - 1;
}

/**
 * Rocks: a mix of single stones, small clumps (up to 2x3) and thin winding
 * ridges, each kept apart from the others with water between. Smooth noise
 * decides where they gather (so some parts of the sea are rockier than others)
 * and which way ridges run. Then the board is tidied so ships never get
 * trapped: any dead-end nook is filled and cut-off pockets are closed. Returns
 * false if a spawn ended up cut off (the caller tries another seed).
 */
function placeRocks(
  grid: Grid,
  rng: Rng,
  spawns: readonly Position[],
  density: number,
): boolean {
  const { width, height } = grid;
  const broad = valueNoise(rng, width, height, 5);

  const lean = valueNoise(rng, width, height, 8);

  const target = Math.round(density * width * height);
  let placedRocks = 0;
  let formation = 0;
  for (let attempt = 0; attempt < FORMATION_ATTEMPTS && placedRocks < target; attempt += 1) {
    // Several random spots; the one where the noise is highest wins, so clumps
    // favour the rocky parts of the sea without all piling into one.
    let best: { x: number; y: number; value: number } | null = null;
    for (let tries = 0; tries < 6; tries += 1) {
      const x = between(rng, 0, width - 1);
      const y = between(rng, 0, height - 1);
      const value = broad(x, y);
      if (
        (best === null || value > best.value) &&
        canPlaceRock(grid, spawns, x, y, formation)
      ) {
        best = { x, y, value };
      }
    }
    if (!best) {
      continue;
    }

    grid.setRock(best.x, best.y, formation);
    const kind = rng();
    if (kind < SINGLE_SHARE) {
      placedRocks += 1;
    } else if (kind < SINGLE_SHARE + CLUMP_SHARE) {
      placedRocks += 1 + growClump(grid, rng, spawns, best, clumpSize(rng), formation);
    } else {
      // A ridge grows both ways from its starting cell, along the way the
      // noise leans there, so neighbouring ridges run alike.
      const length = between(rng, RIDGE_LENGTH[0], RIDGE_LENGTH[1]);
      const heading = Math.floor(lean(best.x, best.y) * 8) % 8;
      const forward = Math.ceil((length - 1) / 2);
      placedRocks +=
        1 +
        growRun(grid, rng, spawns, best, heading, forward, formation) +
        growRun(grid, rng, spawns, best, (heading + 4) % 8, length - 1 - forward, formation);
    }
    formation += 1;
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
