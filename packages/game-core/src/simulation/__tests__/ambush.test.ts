import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import {
  AMBUSH_TEAM_ID,
  ARRIVAL_GAP_TURNS,
  FIRST_ARRIVAL_TURN,
  ambushLayout,
} from '../../domain/Objective';
import { createDuelConfig, createSkirmishConfig } from '../../config/matchConfig';
import { isPlayableShipType } from '../../config/shipTypes';
import { runMatch } from '../../testing/matchRunner';
import { createGame } from '../createGame';
import { evaluateOutcome, resolveTurn } from '../resolveTurn';
import { getLivingShips } from '../selectors';
import { beginNextTurn, bringInArrivals } from '../tokens';
import { totalTokens } from '../../domain/Action';
import { redactState } from '../../view/redact';
import { buildMatchResult } from '../matchResult';
import { submitted } from './testUtils';

const AMBUSH = { kind: 'ambush' as const, turns: 14 };

const ambushMatch = (seed = 1, sea: 'open' | 'normal' = 'open'): GameState =>
  createGame(createDuelConfig({ seed, sea, objective: AMBUSH }));

const withShip = (
  state: GameState,
  id: string,
  patch: Partial<GameState['ships'][string]>,
): GameState => ({ ...state, ships: { ...state.ships, [id]: { ...state.ships[id], ...patch } } });

describe('the layout', () => {
  const hero = { x: 9, y: 14 };

  it('puts the first wave round the hero, facing it, inside the board', () => {
    const layout = ambushLayout(20, 20, hero, 3);
    expect(layout.firstWave).toHaveLength(3);
    for (const ship of layout.firstWave) {
      expect(ship.position.x).toBeGreaterThanOrEqual(0);
      expect(ship.position.y).toBeGreaterThanOrEqual(0);
      expect(ship.position.x).toBeLessThan(20);
      expect(ship.position.y).toBeLessThan(20);
      expect(Math.max(Math.abs(ship.position.x - hero.x), Math.abs(ship.position.y - hero.y))).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(layout.firstWave.map((s) => `${s.position.x},${s.position.y}`)).size).toBe(3);
  });

  it('brings at least two more from the corners, one at a time, from turn 3', () => {
    const layout = ambushLayout(20, 20, hero, 1);
    expect(layout.reinforcements).toHaveLength(2);
    expect(layout.reinforcements.map((r) => r.turn)).toEqual([
      FIRST_ARRIVAL_TURN,
      FIRST_ARRIVAL_TURN + ARRIVAL_GAP_TURNS,
    ]);
    expect(ambushLayout(20, 20, hero, 4).reinforcements).toHaveLength(4);
  });

  it('is pure: the same inputs give the same layout', () => {
    expect(ambushLayout(20, 20, hero, 3)).toEqual(ambushLayout(20, 20, hero, 3));
  });
});

describe('building an ambush match', () => {
  it('puts the raiders on one side, in a light class nobody can pick', () => {
    const config = createDuelConfig({ seed: 2, objective: AMBUSH });
    const ai = config.participants.filter((p) => p.controller === 'ai');
    expect(ai.length).toBe(3);
    expect(new Set(ai.map((p) => p.teamId))).toEqual(new Set([AMBUSH_TEAM_ID]));
    expect(new Set(ai.map((p) => p.shipTypeId))).toEqual(new Set(['raider']));
    expect(isPlayableShipType('raider')).toBe(false);
    expect(ai.filter((p) => p.arrivesOnTurn !== undefined).map((p) => p.arrivesOnTurn)).toEqual([3, 5]);
  });

  it('sets the raiders a skill level below the match', () => {
    const normal = createDuelConfig({ seed: 2, objective: AMBUSH, aiDifficulty: 'normal' });
    const hard = createDuelConfig({ seed: 2, objective: AMBUSH, aiDifficulty: 'hard' });
    expect(normal.participants.find((p) => p.playerId === 'enemy')?.aiDifficulty).toBe('easy');
    expect(hard.participants.find((p) => p.playerId === 'enemy')?.aiDifficulty).toBe('normal');
    expect(normal.participants.find((p) => p.playerId === 'player')?.aiDifficulty).toBe('normal');
  });

  it('gives the hero, and only the hero, a veteran captains guns', () => {
    const state = ambushMatch();
    expect(state.ships['player-ship'].bonusDamage).toBe(1);
    expect('bonusDamage' in state.ships['enemy-ship']).toBe(false);
  });

  it('keeps every start and arrival cell clear of rocks and hazards', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const config = createDuelConfig({ seed, sea: 'stormy', objective: AMBUSH });
      for (const participant of config.participants) {
        const { x, y } = participant.spawn.position;
        expect(config.obstacles.some((o) => o.x === x && o.y === y)).toBe(false);
        expect(config.terrain?.[`${x},${y}`]).toBeUndefined();
      }
    }
  });

  it('works for a skirmish too, with every AI ship a raider', () => {
    const config = createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa', seed: 4, objective: AMBUSH });
    const ai = config.participants.filter((p) => p.controller === 'ai');
    expect(ai).toHaveLength(3 + 3);
    expect(new Set(ai.map((p) => p.teamId))).toEqual(new Set([AMBUSH_TEAM_ID]));
  });

  it('changes nothing for a match without an ambush', () => {
    const config = createDuelConfig({ seed: 2 });
    expect(config.participants.map((p) => p.playerId)).toEqual(['player', 'enemy']);
  });
});

describe('ships that have not arrived', () => {
  it('start with no hull and a turn to come on, and count as nobody afloat', () => {
    const state = ambushMatch();
    const waiting = Object.values(state.ships).filter((s) => s.arrivesOnTurn !== undefined);
    expect(waiting.map((s) => [s.hp, s.arrivesOnTurn])).toEqual([
      [0, 3],
      [0, 5],
    ]);
    expect(getLivingShips(state).map((s) => s.id).sort()).toEqual(['enemy-ship', 'player-ship']);
  });

  it('cannot be shot, and do not stand in the way', () => {
    // The hero fires at a waiting raider sitting in its line: the shot misses.
    const base = ambushMatch();
    const state = withShip(
      withShip(base, 'player-ship', { position: { x: 9, y: 14 }, heading: 'NORTH' }),
      'raider-1-ship',
      { position: { x: 6, y: 14 } },
    );
    const result = resolveTurn(state, {
      ...submitted(),
      player: { movement: [null, null, null, null], cannons: [{ left: 1, right: 0 }, { left: 0, right: 0 }, { left: 0, right: 0 }, { left: 0, right: 0 }] },
    });
    expect(result.events.some((e) => e.type === 'PROJECTILE_HIT' && e.targetId === 'raider-1-ship')).toBe(false);
    expect(result.nextState.ships['raider-1-ship'].hp).toBe(0);
  });

  it('earn no tokens while they wait, and arrive with the stock they started with', () => {
    const state = ambushMatch();
    const before = totalTokens(state.players['raider-1'].tokens);
    const next = beginNextTurn(state).state;
    expect(totalTokens(next.players['raider-1'].tokens)).toBe(before);
    expect(totalTokens(next.players.enemy.tokens)).toBeGreaterThanOrEqual(totalTokens(state.players.enemy.tokens));
  });
});

describe('arriving', () => {
  it('happens at the start of the turn they are due, with a full hull', () => {
    let state = ambushMatch();
    state = beginNextTurn(state).state; // now turn 2
    expect(state.turn).toBe(2);
    expect(state.ships['raider-1-ship'].hp).toBe(0);

    state = beginNextTurn(state).state; // now turn 3
    expect(state.turn).toBe(3);
    expect(state.ships['raider-1-ship']).toMatchObject({ hp: 2 });
    expect('arrivesOnTurn' in state.ships['raider-1-ship']).toBe(false);
    expect(state.ships['raider-2-ship'].hp).toBe(0);

    state = beginNextTurn(beginNextTurn(state).state).state; // turn 5
    expect(state.ships['raider-2-ship'].hp).toBe(2);
  });

  it('waits a turn when something is in the way', () => {
    const state = ambushMatch();
    const spot = state.ships['raider-1-ship'].position;
    const blocked = withShip(state, 'player-ship', { position: spot });
    const ships = bringInArrivals(blocked, 3);
    expect(ships['raider-1-ship']).toMatchObject({ hp: 0, arrivesOnTurn: 4 });
    expect(bringInArrivals(state, 2)['raider-1-ship'].hp).toBe(0);
  });

  it('is seen in the view, with the turn each ship is due', () => {
    const view = redactState(ambushMatch(), 'player', null);
    expect(view.ships['raider-1-ship']).toMatchObject({ hp: 0, arrivesOnTurn: 3 });
    expect(view.objective).toEqual(AMBUSH);
  });
});

describe('winning and losing an ambush', () => {
  it('is won only when every raider is sunk and none are still to come', () => {
    const state = ambushMatch();
    const allSunk = withShip(state, 'enemy-ship', { hp: 0 });
    expect(evaluateOutcome(allSunk)).toBeNull(); // two are still to arrive

    const arrived = withShip(withShip(allSunk, 'raider-1-ship', { hp: 0, arrivesOnTurn: undefined }), 'raider-2-ship', {
      hp: 0,
      arrivesOnTurn: undefined,
    });
    expect(evaluateOutcome(arrived)).toEqual({ kind: 'win', teamId: 'player', reason: 'ambush_broken' });
  });

  it('is never ended early by the last-ship rule', () => {
    const state = withShip(ambushMatch(), 'enemy-ship', { hp: 0 });
    expect(getLivingShips(state)).toHaveLength(1);
    expect(evaluateOutcome(state)).toBeNull();
  });

  it('is lost when the hero is sunk, whoever is still to come', () => {
    const state = withShip(ambushMatch(), 'player-ship', { hp: 0 });
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: AMBUSH_TEAM_ID, reason: 'objective_failed' });
  });

  it('is lost to the clock: raiders left when the turns run out win', () => {
    const state = ambushMatch();
    expect(evaluateOutcome({ ...state, turn: 13 }, true)).toBeNull();
    expect(evaluateOutcome({ ...state, turn: 14 }, false)).toBeNull();
    expect(evaluateOutcome({ ...state, turn: 14 }, true)).toEqual({
      kind: 'win',
      teamId: AMBUSH_TEAM_ID,
      reason: 'overrun',
    });
  });

  it('says in the result whether the hero broke the ambush', () => {
    const over = (outcome: GameState['outcome']): GameState => ({ ...ambushMatch(), outcome });
    expect(buildMatchResult(over({ kind: 'win', teamId: 'player', reason: 'ambush_broken' }))?.objective).toEqual({
      kind: 'ambush',
      met: true,
    });
    expect(buildMatchResult(over({ kind: 'win', teamId: AMBUSH_TEAM_ID, reason: 'overrun' }))?.objective).toEqual({
      kind: 'ambush',
      met: false,
    });
  });
});

describe('whole ambush matches', () => {
  it('always end, and the arrivals do join the fight', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const record = runMatch(createDuelConfig({ seed, sea: 'normal', objective: AMBUSH }));
      expect(record.outcome).not.toBeNull();
      expect(record.turns).toBeLessThanOrEqual(AMBUSH.turns);
    }
  }, 30_000);

  it('are won and lost, over a spread of seeds', () => {
    let hero = 0;
    let other = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const outcome = runMatch(createDuelConfig({ seed, sea: 'normal', objective: AMBUSH })).outcome;
      if (outcome?.kind === 'win' && outcome.teamId === 'player') hero += 1;
      else other += 1;
    }
    expect(hero).toBeGreaterThan(0);
    expect(other).toBeGreaterThan(0);
  }, 30_000);
});
