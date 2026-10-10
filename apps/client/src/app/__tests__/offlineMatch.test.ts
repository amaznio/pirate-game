import { describe, expect, it } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { offlineConfig, startOfflineMatch } from '../offlineMatch';

describe('offlineConfig', () => {
  it('is the classic duel for one opponent, and a skirmish for more', () => {
    expect(offlineConfig(1, '').participants.map((p) => p.playerId)).toEqual(['player', 'enemy']);
    expect(offlineConfig(3, '').participants).toHaveLength(4);
  });

  it('names the player', () => {
    expect(offlineConfig(1, '  Anne ').participants[0].name).toBe('Anne');
    expect(offlineConfig(2, 'Anne').participants[0].name).toBe('Anne');
    expect(offlineConfig(1, '   ').participants[0].name).toBe('Player');
  });

  it('plays at normal skill unless told otherwise', () => {
    const state = createGame(offlineConfig(2, ''));

    expect(Object.values(state.players).every((p) => p.aiDifficulty === 'normal')).toBe(true);
  });

  it.each(['easy', 'normal', 'hard'] as const)('sets every AI to %s', (level) => {
    for (const opponents of [1, 4]) {
      const state = createGame(offlineConfig(opponents, 'Anne', level));

      expect(Object.values(state.players).every((p) => p.aiDifficulty === level)).toBe(true);
    }
  });
});

describe('the sea of an offline match', () => {
  it('follows the chosen style and is new each time', () => {
    const stormy = offlineConfig(1, '', 'normal', 'stormy', 9);
    const calm = offlineConfig(1, '', 'normal', 'calm', 9);
    expect(Object.keys(stormy.terrain ?? {}).length).toBeGreaterThan(
      Object.keys(calm.terrain ?? {}).length,
    );

    const seeds = new Set([1, 2, 3, 4, 5].map(() => offlineConfig(1, '').seed));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('is sent to the player as part of their view', () => {
    const match = startOfflineMatch(offlineConfig(2, 'Anne', 'normal', 'stormy', 4));
    const view = match.client.getView();
    expect(Object.keys(view.obstacles).length).toBeGreaterThan(0);
    expect(Object.keys(view.terrain).length).toBeGreaterThan(0);
    match.dispose();
  });
});

describe('startOfflineMatch', () => {
  it('shows the player which level the computer plays at', () => {
    const match = startOfflineMatch(offlineConfig(2, 'Anne', 'hard'));

    const view = match.client.getView();
    const bots = Object.values(view.players).filter((p) => p.controller === 'ai');
    expect(bots.map((p) => p.aiDifficulty)).toEqual(['hard', 'hard']);
    match.dispose();
  });

  it('plays a turn against an AI at that level', () => {
    const match = startOfflineMatch(offlineConfig(1, 'Anne', 'easy'));

    match.client.lockIn();

    expect(match.client.getView().status).toBe('animating');
    match.dispose();
  });
});
