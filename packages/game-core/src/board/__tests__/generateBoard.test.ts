import { describe, expect, it } from 'vitest';
import { generateSpawns } from '../../config/matchConfig';
import { vectorFor } from '../../domain/Direction';
import { cellKey } from '../../domain/Terrain';
import {
  MAP_PROFILES,
  MAP_STYLES,
  describeBoard,
  generateBoard,
  type GeneratedBoard,
  type MapStyle,
} from '../generateBoard';

const SIZE = 20;
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 1);

function boardFor(seed: number, style: MapStyle = 'normal', ships = 2) {
  const spawns = generateSpawns(SIZE, SIZE, ships).map((spawn) => spawn.position);
  const board = generateBoard({ width: SIZE, height: SIZE, seed, spawns, style });
  return { board, spawns };
}

function rockSet(board: GeneratedBoard): Set<string> {
  return new Set(board.obstacles.map((o) => `${o.x},${o.y}`));
}

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

describe('generateBoard', () => {
  it('gives the same board for the same seed, and different boards for different seeds', () => {
    const a = boardFor(42).board;
    expect(boardFor(42).board).toEqual(a);
    const distinct = new Set(
      SEEDS.slice(0, 20).map((seed) => JSON.stringify(boardFor(seed).board)),
    );
    expect(distinct.size).toBe(20);
  });

  it.each(MAP_STYLES)('keeps every cell on the board and nothing on top of anything (%s)', (style) => {
    for (const seed of SEEDS) {
      const { board } = boardFor(seed, style);
      const seen = new Set<string>();
      const cells = [
        ...board.obstacles.map((o) => ({ x: o.x, y: o.y })),
        ...Object.keys(board.terrain).map((key) => {
          const [x, y] = key.split(',').map(Number);
          return { x, y };
        }),
      ];
      for (const cell of cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(SIZE);
        expect(cell.y).toBeLessThan(SIZE);
        const key = `${cell.x},${cell.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('keeps rocks and hazards away from every starting position', () => {
    for (const ships of [2, 3, 4, 6, 8]) {
      for (const seed of SEEDS.slice(0, 40)) {
        const { board, spawns } = boardFor(seed, 'stormy', ships);
        for (const obstacle of board.obstacles) {
          for (const spawn of spawns) {
            expect(chebyshev(obstacle, spawn)).toBeGreaterThan(2);
          }
        }
        for (const key of Object.keys(board.terrain)) {
          const [x, y] = key.split(',').map(Number);
          for (const spawn of spawns) {
            expect(chebyshev({ x, y }, spawn)).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it('leaves plenty of open water, in one connected piece, with every ship in it', () => {
    for (const style of MAP_STYLES) {
      for (const seed of SEEDS) {
        const { board, spawns } = boardFor(seed, style, 4);
        const rocks = rockSet(board);
        expect(1 - rocks.size / (SIZE * SIZE)).toBeGreaterThanOrEqual(0.8);

        const open: string[] = [];
        for (let y = 0; y < SIZE; y += 1) {
          for (let x = 0; x < SIZE; x += 1) {
            if (!rocks.has(`${x},${y}`)) open.push(`${x},${y}`);
          }
        }
        const reached = new Set<string>([`${spawns[0].x},${spawns[0].y}`]);
        const stack = [spawns[0]];
        while (stack.length > 0) {
          const { x, y } = stack.pop() as { x: number; y: number };
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const key = `${x + dx},${y + dy}`;
            if (open.includes(key) && !reached.has(key)) {
              reached.add(key);
              stack.push({ x: x + dx, y: y + dy });
            }
          }
        }
        expect(reached.size).toBe(open.length);
      }
    }
  });

  it('has no nook walled in on three sides', () => {
    for (const seed of SEEDS) {
      const { board, spawns } = boardFor(seed);
      const rocks = rockSet(board);
      const blocked = (x: number, y: number): boolean =>
        x < 0 || y < 0 || x >= SIZE || y >= SIZE || rocks.has(`${x},${y}`);
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          if (rocks.has(`${x},${y}`) || spawns.some((s) => chebyshev(s, { x, y }) <= 2)) {
            continue;
          }
          const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
            blocked(x + dx, y + dy),
          ).length;
          expect(walls).toBeLessThan(3);
        }
      }
    }
  });

  it('builds single stones, small clumps (up to 2x3) and thin ridges, never a big mass', () => {
    const sizes = new Map<number, number>();
    let ridges = 0;
    for (const style of MAP_STYLES) {
      for (const seed of SEEDS) {
        const rocks = rockSet(boardFor(seed, style, 4).board);
        const seen = new Set<string>();
        for (const start of rocks) {
          if (seen.has(start)) continue;
          // One formation = rocks touching each other (diagonals count).
          const group = [start];
          seen.add(start);
          for (let i = 0; i < group.length; i += 1) {
            const [x, y] = group[i].split(',').map(Number);
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const key = `${x + dx},${y + dy}`;
                if (rocks.has(key) && !seen.has(key)) {
                  seen.add(key);
                  group.push(key);
                }
              }
            }
          }
          sizes.set(group.length, (sizes.get(group.length) ?? 0) + 1);
          expect(group.length).toBeLessThanOrEqual(8);

          const xs = group.map((key) => Number(key.split(',')[0]));
          const ys = group.map((key) => Number(key.split(',')[1]));
          const w = Math.max(...xs) - Math.min(...xs) + 1;
          const h = Math.max(...ys) - Math.min(...ys) + 1;
          const compact = Math.max(w, h) <= 3 && Math.min(w, h) <= 2;
          if (!compact) {
            // Anything bigger than a 2x3 is a ridge: a line, never a solid block.
            ridges += 1;
            for (const key of group) {
              const [x, y] = key.split(',').map(Number);
              expect(
                [`${x},${y}`, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`].every(
                  (cell) => rocks.has(cell),
                ),
              ).toBe(false);
            }
          }
        }
      }
    }
    // A real mix of all three.
    expect(sizes.get(1) ?? 0).toBeGreaterThan(100);
    expect(ridges).toBeGreaterThan(100);
    expect([...sizes.keys()].some((size) => size >= 4 && size <= 6)).toBe(true);
  });

  it('reaches roughly the rock cover the sea asks for', () => {
    for (const style of MAP_STYLES) {
      let total = 0;
      for (const seed of SEEDS) total += boardFor(seed, style).board.obstacles.length;
      const share = total / SEEDS.length / (SIZE * SIZE);
      expect(share).toBeGreaterThan(MAP_PROFILES[style].rockDensity * 0.7);
      expect(share).toBeLessThan(MAP_PROFILES[style].rockDensity + 0.04);
    }
  });

  it('follows the style: calmer water has fewer hazards than stormy water', () => {
    const count = (style: MapStyle) => {
      let hazards = 0;
      let rocks = 0;
      for (const seed of SEEDS) {
        const { board } = boardFor(seed, style);
        hazards += Object.keys(board.terrain).length;
        rocks += board.obstacles.length;
      }
      return { hazards: hazards / SEEDS.length, rocks: rocks / SEEDS.length };
    };
    const calm = count('calm');
    const normal = count('normal');
    const stormy = count('stormy');
    expect(calm.hazards).toBeLessThan(normal.hazards);
    expect(normal.hazards).toBeLessThan(stormy.hazards);
    expect(calm.rocks).toBeLessThan(stormy.rocks);
    expect(stormy.rocks / (SIZE * SIZE)).toBeLessThan(MAP_PROFILES.stormy.rockDensity + 0.06);
  });

  it('builds wind in straight lanes that never blow into a rock, off the board, or in a circle', () => {
    for (const style of MAP_STYLES) {
      for (const seed of SEEDS) {
        const { board } = boardFor(seed, style);
        const rocks = rockSet(board);
        for (const [key, terrain] of Object.entries(board.terrain)) {
          if (terrain.kind !== 'wind') continue;
          const [x, y] = key.split(',').map(Number);
          // Follow the wind: it must end within a lane's length, on open water.
          let cell = { x, y };
          let steps = 0;
          for (;;) {
            const here = board.terrain[cellKey(cell)];
            if (here?.kind !== 'wind') break;
            const delta = vectorFor(here.direction);
            cell = { x: cell.x + delta.x, y: cell.y + delta.y };
            steps += 1;
            expect(steps).toBeLessThanOrEqual(5);
          }
          expect(cell.x).toBeGreaterThanOrEqual(0);
          expect(cell.y).toBeGreaterThanOrEqual(0);
          expect(cell.x).toBeLessThan(SIZE);
          expect(cell.y).toBeLessThan(SIZE);
          expect(rocks.has(`${cell.x},${cell.y}`)).toBe(false);
          expect(board.terrain[cellKey(cell)]).toBeUndefined();
        }
      }
    }
  });

  it('builds whirlpools as whole 2x2 vortices with open water around them', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const { board } = boardFor(seed, 'stormy');
      const rocks = rockSet(board);
      const pools = Object.entries(board.terrain).filter(
        ([, terrain]) => terrain.kind === 'whirlpool',
      );
      expect(pools.length % 4).toBe(0);
      for (const [key, terrain] of pools) {
        if (terrain.kind !== 'whirlpool' || terrain.corner !== 'topLeft') continue;
        seen += 1;
        const [x, y] = key.split(',').map(Number);
        const corners = [
          [x + 1, y, 'topRight'],
          [x, y + 1, 'bottomLeft'],
          [x + 1, y + 1, 'bottomRight'],
        ] as const;
        for (const [cx, cy, corner] of corners) {
          expect(board.terrain[`${cx},${cy}`]).toEqual({
            kind: 'whirlpool',
            spin: terrain.spin,
            corner,
          });
        }
        for (let dy = -1; dy <= 2; dy += 1) {
          for (let dx = -1; dx <= 2; dx += 1) {
            expect(rocks.has(`${x + dx},${y + dy}`)).toBe(false);
          }
        }
        // Not on the very edge of the board.
        expect(x).toBeGreaterThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(1);
        expect(x + 1).toBeLessThanOrEqual(SIZE - 2);
        expect(y + 1).toBeLessThanOrEqual(SIZE - 2);
      }
    }
    expect(seen).toBeGreaterThan(SEEDS.length);
  });

  it('falls back to open water on a board too small to place anything safely', () => {
    const board = generateBoard({
      width: 5,
      height: 5,
      seed: 1,
      spawns: [{ x: 2, y: 2 }],
    });
    expect(board.obstacles).toEqual([]);
    expect(board.terrain).toEqual({});
  });

  it('describes a board as text', () => {
    const { board, spawns } = boardFor(3);
    const text = describeBoard(SIZE, SIZE, board, spawns);
    expect(text.split('\n')).toHaveLength(SIZE);
    expect(text).toContain('S');
  });
});
