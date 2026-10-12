import { describe, expect, it } from 'vitest';
import { DIRECTIONS, vectorFor, type Direction } from '@pirate/game-core/domain/Direction';
import {
  WHIRLPOOL_FRAMES,
  PIXEL_WHIRLPOOL_SIZE,
  WIND_SIZE,
  whirlpoolPixel,
  windPixel,
} from '../pixelTerrain';

function whirlpool(frame: number, clockwise: boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < PIXEL_WHIRLPOOL_SIZE; y += 1) {
    let row = '';
    for (let x = 0; x < PIXEL_WHIRLPOOL_SIZE; x += 1) {
      row += (whirlpoolPixel(x, y, frame, clockwise) ?? '.').slice(-2);
    }
    rows.push(row);
  }
  return rows;
}

function windCells(direction: Direction): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < WIND_SIZE; y += 1) {
    for (let x = 0; x < WIND_SIZE; x += 1) {
      if (windPixel(x, y, direction)) cells.push([x, y]);
    }
  }
  return cells;
}

describe('the pixel whirlpool', () => {
  it('is round: see-through corners, a dark core, an opaque middle', () => {
    expect(whirlpoolPixel(0, 0, 0, true)).toBeNull();
    expect(whirlpoolPixel(PIXEL_WHIRLPOOL_SIZE - 1, 0, 0, true)).toBeNull();
    expect(whirlpoolPixel(15, 15, 0, true)).toBe('#04141d');
    expect(whirlpoolPixel(16, 16, 0, false)).toBe('#04141d');
    expect(whirlpoolPixel(4, 16, 0, true)).not.toBeNull();
  });

  it('turns: each frame differs and the arms line up again after eight', () => {
    const frames = Array.from({ length: WHIRLPOOL_FRAMES }, (_, frame) => whirlpool(frame, true).join('\n'));
    expect(new Set(frames).size).toBe(WHIRLPOOL_FRAMES);
    expect(whirlpool(WHIRLPOOL_FRAMES, true)).toEqual(whirlpool(0, true));
  });

  it('has its own pictures when it turns counter-clockwise', () => {
    for (let frame = 0; frame < WHIRLPOOL_FRAMES; frame += 1) {
      expect(whirlpool(frame, false)).not.toEqual(whirlpool(frame, true));
    }
    const frames = Array.from({ length: WHIRLPOOL_FRAMES }, (_, frame) => whirlpool(frame, false).join('|'));
    expect(new Set(frames).size).toBe(WHIRLPOOL_FRAMES);
  });
});

describe('the pixel wind', () => {
  it('is the same chevrons turned to face each direction', () => {
    const east = windCells('EAST');
    expect(east.length).toBeGreaterThan(10);
    const last = WIND_SIZE - 1;
    const turned: Record<Direction, Array<[number, number]>> = {
      EAST: east,
      WEST: east.map(([x, y]) => [last - x, last - y]),
      SOUTH: east.map(([x, y]) => [last - y, x]),
      NORTH: east.map(([x, y]) => [y, last - x]),
    };
    for (const direction of DIRECTIONS) {
      const sort = (cells: Array<[number, number]>) => cells.map((c) => c.join(',')).sort();
      expect(sort(windCells(direction)), direction).toEqual(sort(turned[direction]));
    }
  });

  it('points the right way: a narrow tip in front and the open ends of the arms behind', () => {
    for (const direction of DIRECTIONS) {
      const { x: dx, y: dy } = vectorFor(direction);
      const along = windCells(direction).map(([x, y]) => x * dx + y * dy);
      const front = along.filter((value) => value === Math.max(...along)).length;
      const back = along.filter((value) => value === Math.min(...along)).length;

      expect(front, direction).toBeLessThan(back);
    }
  });
});
