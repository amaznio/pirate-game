import { describe, expect, it } from 'vitest';
import {
  createDuelConfig,
  createSkirmishConfig,
  generateSpawns,
} from '../matchConfig';
import { createGame } from '../../simulation/createGame';

describe('createDuelConfig', () => {
  it('builds the classic 1v1', () => {
    const state = createGame(createDuelConfig());

    expect(Object.keys(state.players)).toEqual(['player', 'enemy']);
    expect(state.players.player.controller).toBe('human');
    expect(state.players.enemy.controller).toBe('ai');
    expect(state.ships['player-ship'].position).toEqual({ x: 9, y: 14 });
    expect(state.ships['enemy-ship'].position).toEqual({ x: 9, y: 5 });
    expect(state.board).toEqual({ width: 20, height: 20 });
  });

  it('is the default for createGame()', () => {
    expect(createGame()).toEqual(createGame(createDuelConfig()));
  });
});

describe('generateSpawns', () => {
  it('puts the first ship bottom-centre and the second opposite, facing in', () => {
    const [first, second] = generateSpawns(21, 21, 2);

    expect(first).toEqual({ position: { x: 10, y: 17 }, heading: 'NORTH' });
    expect(second).toEqual({ position: { x: 10, y: 3 }, heading: 'SOUTH' });
  });

  it.each([2, 3, 4, 8, 16])('places %i distinct ships inside the board', (count) => {
    const spawns = generateSpawns(30, 30, count);

    const cells = new Set(
      spawns.map((spawn) => `${spawn.position.x},${spawn.position.y}`),
    );
    expect(spawns).toHaveLength(count);
    expect(cells.size).toBe(count);
    for (const { position } of spawns) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThan(30);
      expect(position.y).toBeLessThan(30);
    }
  });

  it('faces every ship toward the centre', () => {
    for (const { position, heading } of generateSpawns(21, 21, 8)) {
      const dx = 10 - position.x;
      const dy = 10 - position.y;
      const towards =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? 'EAST'
            : 'WEST'
          : dy > 0
            ? 'SOUTH'
            : 'NORTH';
      expect(heading).toBe(towards);
    }
  });

  it('throws when the board is too small', () => {
    expect(() => generateSpawns(5, 5, 2)).toThrow();
    expect(() => generateSpawns(10, 10, 40)).toThrow();
  });
});

describe('createSkirmishConfig', () => {
  it('builds any number of humans and AIs', () => {
    const state = createGame(createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa' }));

    expect(Object.keys(state.players)).toHaveLength(4);
    expect(Object.keys(state.ships)).toHaveLength(4);
    expect(
      Object.values(state.players).map((player) => player.controller),
    ).toEqual(['human', 'ai', 'ai', 'ai']);
  });

  it('free-for-all gives everyone their own team', () => {
    const state = createGame(createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa' }));

    const teams = new Set(Object.values(state.players).map((player) => player.teamId));
    expect(teams.size).toBe(4);
  });

  it('teams mode alternates between two teams', () => {
    const state = createGame(createSkirmishConfig({ humans: 2, ais: 2, teamMode: 'teams' }));

    expect(Object.values(state.players).map((player) => player.teamId)).toEqual([
      'team-a',
      'team-b',
      'team-a',
      'team-b',
    ]);
  });

  it('supports a configurable board size', () => {
    const state = createGame(
      createSkirmishConfig({ humans: 1, ais: 1, teamMode: 'ffa', width: 30, height: 24 }),
    );

    expect(state.board).toEqual({ width: 30, height: 24 });
  });

  it('never places an obstacle on a spawn cell', () => {
    const config = createSkirmishConfig({ humans: 1, ais: 7, teamMode: 'ffa' });
    const spawnCells = new Set(
      config.participants.map((p) => `${p.spawn.position.x},${p.spawn.position.y}`),
    );

    for (const obstacle of config.obstacles) {
      expect(spawnCells.has(`${obstacle.x},${obstacle.y}`)).toBe(false);
    }
  });

  it('every ship starts alive with the configured resources', () => {
    const config = createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa' });
    const state = createGame(config);

    for (const player of Object.values(state.players)) {
      expect(player.ammo).toBe(config.startingAmmo);
      expect(player.tokens).toEqual(config.startingTokens);
      expect(state.ships[player.shipId].hp).toBeGreaterThan(0);
      expect(state.ships[player.shipId].ownerId).toBe(player.id);
    }
  });
});
