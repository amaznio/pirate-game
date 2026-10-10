import { describe, expect, it } from 'vitest';
import { createDuelConfig } from '../../config/matchConfig';
import { SHIP_TYPES, getShipType, tokenEconomyOf } from '../../config/shipTypes';
import {
  CANNON_STARTING_AMMO,
  INITIAL_TOKEN_POOL,
} from '../../config/gameRules';
import { totalTokens } from '../../domain/Action';
import type { GameState } from '../../domain/GameState';
import { createGame } from '../createGame';
import { resolveTurn } from '../resolveTurn';
import { beginNextTurn } from '../tokens';

const noCannons = Array.from({ length: 4 }, () => ({ left: 0, right: 0 }));
const idlePlan = { movement: [null, null, null, null], cannons: noCannons };
const movingPlan = { movement: ['FORWARD', null, null, null] as const, cannons: noCannons };

function duelOf(player: string, enemy = 'sloop'): GameState {
  return createGame(createDuelConfig({ sea: 'open', shipTypeIds: [player, enemy] }));
}

const empty = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };

/** A state in which the player holds exactly these tokens. */
function holding(state: GameState, tokens: { FORWARD: number; TURN_LEFT: number; TURN_RIGHT: number }): GameState {
  return {
    ...state,
    players: { ...state.players, player: { ...state.players.player, tokens } },
  };
}

describe('ship classes', () => {
  it('has a sloop that sails with the classic rules', () => {
    const state = duelOf('sloop');
    const player = state.players.player;

    expect(player.tokens).toEqual(INITIAL_TOKEN_POOL);
    expect(player.ammo).toBe(CANNON_STARTING_AMMO);
    expect(tokenEconomyOf(getShipType('sloop'))).toMatchObject({
      perTurn: 1,
      cap: null,
      restBonus: 0,
    });
    expect(state.ships['player-ship'].maxHp).toBe(4);
  });

  it('makes each bigger class stronger in hull, reserve and income', () => {
    const ladder = ['sloop', 'brigantine', 'galleon'].map(getShipType);
    const start = (type: (typeof ladder)[number]) =>
      totalTokens(type.tokens?.start ?? INITIAL_TOKEN_POOL);

    for (let i = 1; i < ladder.length; i += 1) {
      const smaller = ladder[i - 1];
      const bigger = ladder[i];

      expect(bigger.maxHp).toBeGreaterThan(smaller.maxHp);
      expect(start(bigger)).toBeGreaterThan(start(smaller));
      expect(bigger.tokens?.perTurn ?? 1).toBeGreaterThanOrEqual(smaller.tokens?.perTurn ?? 1);
      expect(bigger.supplyUse).toBeGreaterThan(smaller.supplyUse);
      expect(bigger.cargoCap).toBeGreaterThan(smaller.cargoCap);
    }
  });

  it('gives a ship its own reserve and hull', () => {
    const state = duelOf('galleon', 'brigantine');

    expect(totalTokens(state.players.player.tokens)).toBe(10);
    expect(totalTokens(state.players.enemy.tokens)).toBe(8);
    expect(state.ships['player-ship'].maxHp).toBe(6);
    expect(state.ships['enemy-ship'].maxHp).toBe(5);
  });

  it('starts every class inside its own cap', () => {
    for (const type of Object.values(SHIP_TYPES)) {
      const start = totalTokens(type.tokens?.start ?? INITIAL_TOKEN_POOL);

      expect(type.tokens?.cap ?? Infinity).toBeGreaterThanOrEqual(start);
    }
  });

  it('refuses a ship type it does not know', () => {
    expect(() => duelOf('raft')).toThrow(/Unknown ship type/);
  });
});

describe('token income', () => {
  it('produces the ship income each turn', () => {
    expect(beginNextTurn(duelOf('sloop')).produced.player).toHaveLength(1);
    expect(beginNextTurn(duelOf('brigantine')).produced.player).toHaveLength(2);
  });

  it('follows the class rotation, so a galleon turns less often', () => {
    let state = holding(duelOf('galleon'), empty);
    const made: string[] = [];
    // A galleon makes 2 a turn, so 3 turns is one full pass of its 6-token rotation.
    for (let i = 0; i < 3; i += 1) {
      const next = beginNextTurn(state);
      made.push(...next.produced.player);
      state = next.state;
    }

    expect(made).toEqual(['FORWARD', 'FORWARD', 'TURN_LEFT', 'FORWARD', 'FORWARD', 'TURN_RIGHT']);
  });

  it('stops producing once the hold is full', () => {
    const nearlyFull = holding(duelOf('brigantine'), { FORWARD: 5, TURN_LEFT: 3, TURN_RIGHT: 1 });

    const next = beginNextTurn(nearlyFull);

    expect(next.produced.player).toHaveLength(1);
    expect(totalTokens(next.state.players.player.tokens)).toBe(10);

    const again = beginNextTurn(next.state);

    expect(again.produced.player).toEqual([]);
    expect(totalTokens(again.state.players.player.tokens)).toBe(10);
  });

  it('does not move the rotation on while the hold is full', () => {
    const full = holding(duelOf('brigantine'), { FORWARD: 5, TURN_LEFT: 3, TURN_RIGHT: 2 });

    const next = beginNextTurn(full);

    expect(next.state.players.player.tokenGeneration.rotationIndex).toBe(
      full.players.player.tokenGeneration.rotationIndex,
    );
  });
});

describe('rest bonus', () => {
  it('is earned by planning no move, and cleared once paid', () => {
    const resolved = resolveTurn(holding(duelOf('brigantine'), empty), {
      player: idlePlan,
      enemy: movingPlan,
    });

    expect(resolved.nextState.players.player.restedLastTurn).toBe(true);
    expect(resolved.nextState.players.enemy.restedLastTurn).toBe(false);

    const paid = beginNextTurn(resolved.nextState);

    expect(paid.produced.player).toHaveLength(3);
    expect(paid.state.players.player.restedLastTurn).toBe(false);
  });

  it('pays nothing extra after a turn with a move', () => {
    const resolved = resolveTurn(duelOf('brigantine'), { player: movingPlan, enemy: movingPlan });

    expect(beginNextTurn(resolved.nextState).produced.player).toHaveLength(2);
  });

  it('never pays a sloop anything extra', () => {
    const resolved = resolveTurn(duelOf('sloop'), { player: idlePlan, enemy: idlePlan });

    expect(beginNextTurn(resolved.nextState).produced.player).toHaveLength(1);
  });

  it('is still limited by the cap', () => {
    const resolved = resolveTurn(
      holding(duelOf('brigantine'), { FORWARD: 5, TURN_LEFT: 3, TURN_RIGHT: 1 }),
      { player: idlePlan, enemy: idlePlan },
    );

    const paid = beginNextTurn(resolved.nextState);

    expect(totalTokens(paid.state.players.player.tokens)).toBe(10);
  });
});
