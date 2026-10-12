import { describe, expect, it } from 'vitest';
import { createDuelConfig, createSkirmishConfig } from '../../config/matchConfig';
import { generateSpawns } from '../../config/matchConfig';
import { generateBoard } from '../generateBoard';
import { generatePickups } from '../generatePickups';
import { PICKUP_KINDS } from '../../domain/Pickup';
import { PICKUP_COUNT } from '../../config/gameRules';

function pickupsFor(seed: number, style: 'calm' | 'normal' | 'stormy' = 'normal') {
  const spawns = generateSpawns(20, 20, 4).map((s) => s.position);
  const board = generateBoard({ width: 20, height: 20, seed, spawns, style });
  return {
    spawns,
    board,
    pickups: generatePickups({ width: 20, height: 20, seed, spawns, ...board }),
  };
}

describe('generatePickups', () => {
  it('is the same for the same seed and different for another', () => {
    expect(pickupsFor(7).pickups).toEqual(pickupsFor(7).pickups);
    expect(pickupsFor(7).pickups).not.toEqual(pickupsFor(8).pickups);
  });

  it('places a few, one of each kind among them, and never on a hazard or near a spawn', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const style of ['calm', 'normal', 'stormy'] as const) {
        const { spawns, board, pickups } = pickupsFor(seed, style);
        const keys = Object.keys(pickups);
        expect(keys.length).toBeGreaterThanOrEqual(3);
        expect(keys.length).toBeLessThanOrEqual(PICKUP_COUNT[1]);
        expect(new Set(keys.map((k) => pickups[k].kind))).toEqual(new Set(PICKUP_KINDS));
        const rocks = new Set(board.obstacles.map((o) => `${o.x},${o.y}`));
        for (const key of keys) {
          const [x, y] = key.split(',').map(Number);
          expect(rocks.has(key)).toBe(false);
          expect(board.terrain[key]).toBeUndefined();
          expect(x >= 0 && y >= 0 && x < 20 && y < 20).toBe(true);
          for (const spawn of spawns) {
            expect(Math.max(Math.abs(spawn.x - x), Math.abs(spawn.y - y))).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it('does not change the rocks and winds of a seed', () => {
    const plain = createSkirmishConfig({ humans: 1, ais: 1, teamMode: 'ffa', seed: 5 });
    const loot = createSkirmishConfig({ humans: 1, ais: 1, teamMode: 'ffa', seed: 5, loot: true });
    expect(loot.obstacles).toEqual(plain.obstacles);
    expect(loot.terrain).toEqual(plain.terrain);
  });
});

describe('Loot option', () => {
  it('is off by default and carried into the match when on', () => {
    expect(createDuelConfig({ seed: 3 }).pickups).toBeUndefined();
    expect(createSkirmishConfig({ humans: 1, ais: 1, teamMode: 'ffa', seed: 3 }).pickups).toBeUndefined();
    expect(Object.keys(createDuelConfig({ seed: 3, loot: true }).pickups ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(createDuelConfig({ seed: 3, sea: 'open', loot: true }).pickups ?? {}).length).toBeGreaterThan(0);
  });
});
