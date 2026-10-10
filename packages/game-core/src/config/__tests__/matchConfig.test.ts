import { describe, expect, it } from 'vitest';
import {
  createDuelConfig,
  createSkirmishConfig,
  generateSpawns,
  withAiDifficulty,
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
    expect(createGame()).toEqual(createGame(createDuelConfig({ sea: 'open' })));
  });
});

describe('seas', () => {
  const spawnsOf = (config: ReturnType<typeof createDuelConfig>) =>
    config.participants.map((participant) => participant.spawn.position);

  it('builds the same sea from the same seed, and a new one from another', () => {
    const a = createDuelConfig({ seed: 11 });
    expect(createDuelConfig({ seed: 11 })).toEqual(a);
    const others = [12, 13, 14, 15].map((seed) => createDuelConfig({ seed }));
    expect(others.some((other) => JSON.stringify(other.obstacles) !== JSON.stringify(a.obstacles))).toBe(true);
  });

  it('puts the rocks and terrain into the starting state, away from the ships', () => {
    const config = createDuelConfig({ seed: 5, sea: 'stormy' });
    const state = createGame(config);
    expect(Object.keys(state.obstacles)).toHaveLength(config.obstacles.length);
    expect(state.terrain).toEqual(config.terrain);
    expect(config.obstacles.length).toBeGreaterThan(0);
    for (const spawn of spawnsOf(config)) {
      expect(config.obstacles.some((o) => o.x === spawn.x && o.y === spawn.y)).toBe(false);
    }
  });

  it('can be empty water', () => {
    const config = createDuelConfig({ seed: 5, sea: 'open' });
    expect(config.obstacles).toEqual([]);
    expect(config.terrain).toEqual({});
  });

  it('is generated for many ships and for any board size', () => {
    const config = createSkirmishConfig({
      humans: 1,
      ais: 5,
      teamMode: 'ffa',
      width: 28,
      height: 24,
      seed: 3,
      sea: 'stormy',
    });
    expect(config.obstacles.every((o) => o.x < 28 && o.y < 24)).toBe(true);
    expect(config.obstacles.length).toBeGreaterThan(0);
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

describe('player names', () => {
  it('names the duel players and gives every skirmish player a name', () => {
    const duel = createGame(createDuelConfig());
    expect(duel.players.player.name).toBe('Player');
    expect(duel.players.enemy.name).toBe('Enemy');

    const skirmish = createGame(
      createSkirmishConfig({ humans: 2, ais: 2, teamMode: 'ffa' }),
    );
    expect(Object.values(skirmish.players).map((player) => player.name)).toEqual([
      'Player 1',
      'Player 2',
      'Bot 3',
      'Bot 4',
    ]);
  });
});

describe('AI difficulty', () => {
  it('defaults to normal for everyone', () => {
    const state = createGame(createSkirmishConfig({ humans: 1, ais: 2, teamMode: 'ffa' }));

    expect(Object.values(state.players).map((player) => player.aiDifficulty)).toEqual([
      'normal',
      'normal',
      'normal',
    ]);
  });

  it('is set for the whole match, humans included (it is what sails their ship if they go away)', () => {
    const state = createGame(
      createSkirmishConfig({ humans: 2, ais: 1, teamMode: 'ffa', aiDifficulty: 'hard' }),
    );

    for (const player of Object.values(state.players)) {
      expect(player.aiDifficulty).toBe('hard');
    }
  });

  it('applies to the classic duel too', () => {
    const state = createGame(createDuelConfig({ aiDifficulty: 'easy' }));

    expect(state.players.enemy.aiDifficulty).toBe('easy');
  });

  it('can differ per ship', () => {
    const config = createSkirmishConfig({ humans: 1, ais: 2, teamMode: 'ffa' });
    const state = createGame({
      ...config,
      participants: config.participants.map((participant, index) =>
        index === 1 ? { ...participant, aiDifficulty: 'easy' as const } : participant,
      ),
    });

    expect(state.players.p2.aiDifficulty).toBe('easy');
    expect(state.players.p3.aiDifficulty).toBe('normal');
  });

  it('can be applied to an existing config', () => {
    const config = withAiDifficulty(createDuelConfig(), 'hard');

    expect(config.participants.every((participant) => participant.aiDifficulty === 'hard')).toBe(true);
  });
});
