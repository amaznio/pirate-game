import { describe, expect, it } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { createDuelConfig } from '@pirate/game-core/config/matchConfig';
import { redactState } from '@pirate/game-core/view/redact';
import type { GameState } from '@pirate/game-core/domain/GameState';
import { endNote, objectiveProgress } from '../objectiveProgress';

const viewOf = (state: GameState) => redactState(state, 'player', null);

describe('objectiveProgress', () => {
  it('is null for a standard match', () => {
    expect(objectiveProgress(viewOf(createGame()))).toBeNull();
  });

  it('counts turns for survive, never past the limit', () => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'survive', turns: 8 } }));
    expect(objectiveProgress(viewOf({ ...base, turn: 3 }))).toEqual({ kind: 'survive', turn: 3, turns: 8 });
    expect(objectiveProgress(viewOf({ ...base, turn: 12 }))).toEqual({ kind: 'survive', turn: 8, turns: 8 });
  });

  it('scores the viewers team against the best other team for salvage', () => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'salvage', target: 3 } }));
    const state: GameState = {
      ...base,
      pickupsTaken: {
        player: { barrel: 1, crate: 1, plank: 0 },
        enemy: { barrel: 0, crate: 0, plank: 1 },
      },
    };
    expect(objectiveProgress(viewOf(state))).toEqual({ kind: 'salvage', yours: 2, rival: 1, target: 3 });
    expect(objectiveProgress(viewOf(base))).toEqual({ kind: 'salvage', yours: 0, rival: 0, target: 3 });
  });
});

describe('endNote', () => {
  const survive = viewOf(createGame(createDuelConfig({ sea: 'open', objective: { kind: 'survive', turns: 5 } })));
  const salvage = viewOf(createGame(createDuelConfig({ sea: 'open', objective: { kind: 'salvage', target: 2 } })));
  const standard = viewOf(createGame());

  it('says nothing for a standard match or an unfinished one', () => {
    expect(endNote(standard, 'win', 'survived')).toBeNull();
    expect(endNote(survive, null, undefined)).toBeNull();
  });

  it('explains how a survive match ended', () => {
    expect(endNote(survive, 'win', 'survived')).toBe('survived');
    expect(endNote(survive, 'loss', 'objective_failed')).toBe('objectiveFailed');
    expect(endNote(survive, 'win', undefined)).toBeNull();
  });

  it('explains how a salvage match ended, including a draw', () => {
    expect(endNote(salvage, 'win', 'salvaged')).toBe('salvageWon');
    expect(endNote(salvage, 'loss', 'salvaged')).toBe('salvageLost');
    expect(endNote(salvage, 'draw', undefined)).toBe('salvageDraw');
    expect(endNote(salvage, 'loss', undefined)).toBeNull();
  });
});
