import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { Objective } from '../../domain/Objective';
import { salvagePickupCount } from '../../domain/Objective';
import { createDuelConfig } from '../../config/matchConfig';
import { runMatch } from '../../testing/matchRunner';
import { evaluateOutcome, resolveTurn } from '../resolveTurn';
import { evaluateObjective, heroTeams } from '../objectives';
import { buildMatchResult } from '../matchResult';
import { redactState, viewToState } from '../../view/redact';
import { defaultEnemy, defaultPlayer, gameWith, submitted } from './testUtils';

/** A duel of two armed-free ships far apart, with the given objective and turn. */
function duel(objective: Objective | undefined, turn = 1): GameState {
  const state = gameWith(
    defaultPlayer({ position: { x: 5, y: 15 }, heading: 'NORTH' }),
    defaultEnemy({ position: { x: 15, y: 3 }, heading: 'SOUTH' }),
  );
  return { ...state, turn, ...(objective === undefined ? {} : { objective }) };
}

const withHull = (state: GameState, shipId: string, hp: number): GameState => ({
  ...state,
  ships: { ...state.ships, [shipId]: { ...state.ships[shipId], hp } },
});

const withTaken = (
  state: GameState,
  taken: Record<string, { barrel: number; crate: number; plank: number }>,
  pickups: GameState['pickups'] = { '1,1': { kind: 'barrel' } },
): GameState => ({ ...state, pickupsTaken: taken, pickups });

describe('hero team', () => {
  it('is the humans team, or the first player when nobody is human', () => {
    expect([...heroTeams(duel(undefined))]).toEqual(['player']);
    const base = duel(undefined);
    const aiOnly: GameState = {
      ...base,
      players: {
        ...base.players,
        player: { ...base.players.player, controller: 'ai' },
      },
    };
    expect([...heroTeams(aiOnly)]).toEqual(['player']);
  });
});

describe('survive N turns', () => {
  const survive: Objective = { kind: 'survive', turns: 3 };

  it('is won by being afloat when turn N ends, not before', () => {
    const early = resolveTurn(duel(survive, 2), submitted()).nextState;
    expect(early.outcome).toBeNull();

    const last = resolveTurn(duel(survive, 3), submitted());
    expect(last.nextState.outcome).toEqual({ kind: 'win', teamId: 'player', reason: 'survived' });
    expect(last.nextState.status).toBe('game_over');
  });

  it('does not end in the middle of the last turn', () => {
    expect(evaluateObjective(duel(survive, 3), false)).toBeNull();
    expect(evaluateObjective(duel(survive, 3), true)).toMatchObject({ reason: 'survived' });
  });

  it('is lost the moment the hero team is sunk, even with several enemies left', () => {
    const state = withHull(duel(survive, 1), 'player-ship', 0);
    expect(evaluateOutcome(state)).toEqual({
      kind: 'win',
      teamId: 'enemy',
      reason: 'objective_failed',
    });
  });

  it('is a draw if everyone is sunk', () => {
    const state = withHull(withHull(duel(survive, 1), 'player-ship', 0), 'enemy-ship', 0);
    expect(evaluateOutcome(state)).toEqual({ kind: 'draw' });
  });

  it('still lets the hero win early by sinking everyone else', () => {
    const state = withHull(duel(survive, 1), 'enemy-ship', 0);
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: 'player' });
  });
});

describe('salvage race', () => {
  const salvage: Objective = { kind: 'salvage', target: 2 };
  const some = { barrel: 1, crate: 1, plank: 0 };
  const one = { barrel: 1, crate: 0, plank: 0 };

  it('goes on while nobody has the target and pickups are afloat', () => {
    expect(evaluateOutcome(withTaken(duel(salvage), { player: one }))).toBeNull();
  });

  it('is won by the first team to the target', () => {
    const state = withTaken(duel(salvage), { player: some, enemy: one });
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: 'player', reason: 'salvaged' });
  });

  it('can be won by the opposition', () => {
    const state = withTaken(duel(salvage), { player: one, enemy: some });
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: 'enemy', reason: 'salvaged' });
  });

  it('ends when nothing is left afloat, and the most taken wins', () => {
    const state = withTaken(duel(salvage), { player: one }, {});
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: 'player', reason: 'salvaged' });
  });

  it('is a draw on a tie, or when nobody took anything', () => {
    expect(evaluateOutcome(withTaken(duel(salvage), { player: one, enemy: one }, {}))).toEqual({
      kind: 'draw',
    });
    expect(evaluateOutcome(withTaken(duel(salvage), {}, {}))).toEqual({ kind: 'draw' });
  });

  it('ends the match in the phase the target is reached', () => {
    const state = {
      ...duel(salvage),
      ships: {
        ...duel(salvage).ships,
        'player-ship': {
          ...duel(salvage).ships['player-ship'],
          position: { x: 5, y: 10 },
          heading: 'EAST' as const,
        },
      },
      pickups: { '6,10': { kind: 'barrel' as const }, '7,10': { kind: 'crate' as const } },
    };
    const result = resolveTurn(state, submitted(['FORWARD', 'FORWARD', null, null]));
    expect(result.nextState.outcome).toEqual({ kind: 'win', teamId: 'player', reason: 'salvaged' });
    expect(result.events.filter((e) => e.type === 'GAME_ENDED')).toHaveLength(1);
  });
});

describe('a match without an objective', () => {
  it('is settled exactly as before', () => {
    expect(evaluateObjective(duel(undefined), true)).toBeNull();
    expect(evaluateOutcome(duel(undefined), true)).toBeNull();
    expect('objective' in resolveTurn(duel(undefined), submitted()).nextState).toBe(false);
  });
});

describe('objective in the config, the view and the result', () => {
  it('a salvage config floats 2 * target - 1 pickups, with or without Loot', () => {
    const config = createDuelConfig({
      seed: 4,
      sea: 'open',
      objective: { kind: 'salvage', target: 3 },
    });
    expect(Object.keys(config.pickups ?? {})).toHaveLength(salvagePickupCount(3));
    expect(config.objective).toEqual({ kind: 'salvage', target: 3 });
  });

  it('a survive config adds no pickups of its own', () => {
    const config = createDuelConfig({ seed: 4, objective: { kind: 'survive', turns: 5 } });
    expect(config.pickups).toBeUndefined();
  });

  it('every player sees the objective and the scores', () => {
    const state = withTaken(duel({ kind: 'salvage', target: 2 }), {
      enemy: { barrel: 1, crate: 0, plank: 0 },
    });
    const view = redactState(state, 'player', null);
    expect(view.objective).toEqual({ kind: 'salvage', target: 2 });
    expect(view.pickupsTaken).toEqual(state.pickupsTaken);
    expect(viewToState(view).objective).toEqual({ kind: 'salvage', target: 2 });
    expect('objective' in redactState(duel(undefined), 'player', null)).toBe(false);
  });

  it('the result says whether the hero team met the objective', () => {
    const met = { ...duel({ kind: 'survive', turns: 3 }, 3), outcome: { kind: 'win' as const, teamId: 'player' } };
    expect(buildMatchResult(met)?.objective).toEqual({ kind: 'survive', met: true });
    const missed = { ...met, outcome: { kind: 'win' as const, teamId: 'enemy' } };
    expect(buildMatchResult(missed)?.objective).toEqual({ kind: 'survive', met: false });
    const plain = { ...duel(undefined), outcome: { kind: 'draw' as const } };
    expect(buildMatchResult(plain)).not.toHaveProperty('objective');
  });
});

describe('whole matches with an objective', () => {
  it('a survive match never runs past its turn limit', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const record = runMatch(createDuelConfig({ seed, objective: { kind: 'survive', turns: 4 } }));
      expect(record.outcome).not.toBeNull();
      expect(record.turns).toBeLessThanOrEqual(4);
    }
  });

  it('a salvage match always ends with a result', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const record = runMatch(
        createDuelConfig({ seed, sea: 'normal', objective: { kind: 'salvage', target: 2 } }),
      );
      expect(record.outcome).not.toBeNull();
    }
  });
});
