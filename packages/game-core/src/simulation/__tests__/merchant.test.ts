import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import { createDuelConfig, createSkirmishConfig } from '../../config/matchConfig';
import {
  ESCORT_TEAM_ID,
  MERCHANT_PLAYER_ID,
  MERCHANT_SHIP_ID,
} from '../../domain/Objective';
import { isPlayableShipType } from '../../config/shipTypes';
import { parseShipTypeId } from '../../protocol/validate';
import { planAiActions } from '../../ai/simpleAI';
import { runMatch } from '../../testing/matchRunner';
import { createGame } from '../createGame';
import { evaluateOutcome, resolveTurn } from '../resolveTurn';
import { getHostiles } from '../selectors';
import { buildMatchResult } from '../matchResult';
import { redactState } from '../../view/redact';
import { submitted } from './testUtils';

const MERCHANT = { kind: 'merchant' as const, turns: 12 };

const merchantMatch = (seed = 1): GameState =>
  createGame(createDuelConfig({ seed, sea: 'open', objective: MERCHANT }));

const withShip = (
  state: GameState,
  id: string,
  patch: Partial<GameState['ships'][string]>,
): GameState => ({ ...state, ships: { ...state.ships, [id]: { ...state.ships[id], ...patch } } });

describe('building a merchant match', () => {
  it('adds an unarmed AI merchant on the escorts side, and tells the objective which ship it is', () => {
    const config = createDuelConfig({ seed: 3, objective: MERCHANT });
    const merchant = config.participants.find((p) => p.playerId === MERCHANT_PLAYER_ID);

    expect(merchant).toMatchObject({
      shipTypeId: 'merchantman',
      controller: 'ai',
      teamId: ESCORT_TEAM_ID,
    });
    expect(config.participants.find((p) => p.playerId === 'enemy')?.teamId).toBe(ESCORT_TEAM_ID);
    expect(config.participants.find((p) => p.playerId === 'player')?.teamId).toBe('player');
    expect(config.objective).toEqual({
      kind: 'merchant',
      turns: 12,
      shipId: MERCHANT_SHIP_ID,
      exit: 'EAST',
    });
  });

  it('keeps the merchant clear of rocks, wind and whirlpools at the start', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const config = createDuelConfig({ seed, sea: 'stormy', objective: MERCHANT });
      const spawn = config.participants.find((p) => p.playerId === MERCHANT_PLAYER_ID)!.spawn.position;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const x = spawn.x + dx;
          const y = spawn.y + dy;
          expect(config.obstacles.some((o) => o.x === x && o.y === y)).toBe(false);
        }
      }
      expect(config.terrain?.[`${spawn.x},${spawn.y}`]).toBeUndefined();
    }
  });

  it('puts every AI ship of a skirmish on the merchants side', () => {
    const config = createSkirmishConfig({
      humans: 1,
      ais: 3,
      teamMode: 'ffa',
      seed: 5,
      objective: MERCHANT,
    });
    const ai = config.participants.filter((p) => p.controller === 'ai');
    expect(ai).toHaveLength(4);
    expect(new Set(ai.map((p) => p.teamId))).toEqual(new Set([ESCORT_TEAM_ID]));
  });

  it('builds the merchant ship with no guns, and keeps its class out of every ship choice', () => {
    const state = merchantMatch();
    expect(state.ships[MERCHANT_SHIP_ID].weapons).toEqual([]);
    expect(state.ships[MERCHANT_SHIP_ID].shipTypeId).toBe('merchantman');
    expect(isPlayableShipType('merchantman')).toBe(false);
    expect(isPlayableShipType('sloop')).toBe(true);
    expect(parseShipTypeId('merchantman')).toBeNull();
  });

  it('is left alone by the escorts, and leaves them alone', () => {
    const state = merchantMatch();
    const enemy = state.ships['enemy-ship'];
    const merchant = state.ships[MERCHANT_SHIP_ID];
    expect(getHostiles(state, enemy).map((s) => s.id)).toEqual(['player-ship']);
    expect(getHostiles(state, merchant).map((s) => s.id)).toEqual(['player-ship']);
  });

  it('changes nothing for a match with no merchant', () => {
    const config = createDuelConfig({ seed: 3 });
    expect(config.participants.map((p) => p.playerId)).toEqual(['player', 'enemy']);
    expect(config.objective).toBeUndefined();
  });
});

describe('the merchant getting away', () => {
  it('leaves the match when it ends a phase on the exit edge, and the escorts win', () => {
    const state = withShip(merchantMatch(), MERCHANT_SHIP_ID, {
      position: { x: 18, y: 10 },
      heading: 'EAST',
    });

    const result = resolveTurn(state, {
      ...submitted(),
      [MERCHANT_PLAYER_ID]: { movement: ['FORWARD', null, null, null], cannons: [] },
    });

    const escape = result.events.find((e) => e.type === 'SHIP_ESCAPED');
    expect(escape).toMatchObject({ shipId: MERCHANT_SHIP_ID, at: { x: 19, y: 10 }, phase: 0 });
    expect(result.nextState.ships[MERCHANT_SHIP_ID]).toMatchObject({ hp: 0, escaped: true });
    expect(result.nextState.outcome).toEqual({ kind: 'win', teamId: ESCORT_TEAM_ID, reason: 'escaped' });
    expect(result.nextState.status).toBe('game_over');
  });

  it('is not escaped just for being near the edge', () => {
    const state = withShip(merchantMatch(), MERCHANT_SHIP_ID, { position: { x: 17, y: 10 }, heading: 'EAST' });
    const result = resolveTurn(state, {
      ...submitted(),
      [MERCHANT_PLAYER_ID]: { movement: ['FORWARD', null, null, null], cannons: [] },
    });
    expect(result.events.some((e) => e.type === 'SHIP_ESCAPED')).toBe(false);
    expect(result.nextState.outcome).toBeNull();
  });

  it('gets clean away when its turns run out, but not before', () => {
    const state = merchantMatch();
    expect(evaluateOutcome({ ...state, turn: 11 }, true)).toBeNull();
    expect(evaluateOutcome({ ...state, turn: 12 }, false)).toBeNull();
    expect(evaluateOutcome({ ...state, turn: 12 }, true)).toEqual({
      kind: 'win',
      teamId: ESCORT_TEAM_ID,
      reason: 'escaped',
    });
  });
});

describe('the merchant being sunk', () => {
  it('is a win for the hero team, whatever the escorts still have afloat', () => {
    const state = withShip(merchantMatch(), MERCHANT_SHIP_ID, { hp: 0 });
    expect(evaluateOutcome(state)).toEqual({ kind: 'win', teamId: 'player', reason: 'intercepted' });
  });

  it('is a draw if the hero team went down with it', () => {
    const state = withShip(withShip(merchantMatch(), MERCHANT_SHIP_ID, { hp: 0 }), 'player-ship', { hp: 0 });
    expect(evaluateOutcome(state)).toEqual({ kind: 'draw' });
  });

  it('is lost when the hero team is sunk first', () => {
    const state = withShip(merchantMatch(), 'player-ship', { hp: 0 });
    expect(evaluateOutcome(state)).toEqual({
      kind: 'win',
      teamId: ESCORT_TEAM_ID,
      reason: 'objective_failed',
    });
  });

  it('is not settled by sinking only the escorts', () => {
    const state = withShip(merchantMatch(), 'enemy-ship', { hp: 0 });
    expect(evaluateOutcome(state)).toBeNull();
  });
});

describe('the result and the view', () => {
  it('says whether the hero team intercepted the merchant', () => {
    const over = (outcome: GameState['outcome']): GameState => ({ ...merchantMatch(), outcome });
    expect(
      buildMatchResult(over({ kind: 'win', teamId: 'player', reason: 'intercepted' }))?.objective,
    ).toEqual({ kind: 'merchant', met: true });
    expect(
      buildMatchResult(over({ kind: 'win', teamId: ESCORT_TEAM_ID, reason: 'escaped' }))?.objective,
    ).toEqual({ kind: 'merchant', met: false });
  });

  it('shows everyone the merchant and its exit', () => {
    const view = redactState(merchantMatch(), 'player', null);
    expect(view.objective).toEqual({ kind: 'merchant', turns: 12, shipId: MERCHANT_SHIP_ID, exit: 'EAST' });
    expect(view.ships[MERCHANT_SHIP_ID]).toBeDefined();
  });
});

describe('the merchants route', () => {
  it('heads for its exit edge', () => {
    const state = merchantMatch(2);
    const plan = planAiActions(state, MERCHANT_PLAYER_ID);
    const moves = plan.movement.filter((m) => m !== null);
    expect(moves.length).toBeGreaterThan(0);

    const next = resolveTurn(state, {
      [MERCHANT_PLAYER_ID]: plan,
      player: { movement: [null, null, null, null], cannons: [] },
      enemy: { movement: [null, null, null, null], cannons: [] },
    }).nextState;
    expect(next.ships[MERCHANT_SHIP_ID].position.x).toBeGreaterThan(state.ships[MERCHANT_SHIP_ID].position.x);
  });

  it('is the same every time', () => {
    const state = merchantMatch(2);
    expect(planAiActions(state, MERCHANT_PLAYER_ID)).toEqual(planAiActions(state, MERCHANT_PLAYER_ID));
  });
});

describe('whole merchant matches', () => {
  it('always end, and the merchant fires nothing', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const record = runMatch(createDuelConfig({ seed, sea: 'normal', objective: MERCHANT }));
      expect(record.outcome).not.toBeNull();
      expect(
        record.events.some((e) => e.type === 'CANNON_FIRED' && e.shipId === MERCHANT_SHIP_ID),
      ).toBe(false);
    }
  });

  it('are won and lost by the hero team, over a spread of seeds', () => {
    let hero = 0;
    let other = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const outcome = runMatch(createDuelConfig({ seed, sea: 'normal', objective: MERCHANT })).outcome;
      if (outcome?.kind === 'win' && outcome.teamId === 'player') hero += 1;
      else other += 1;
    }
    expect(hero).toBeGreaterThan(0);
    expect(other).toBeGreaterThan(0);
  });
});
