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
  it('has a sloop that sails with the default rules', () => {
    const state = duelOf('sloop');
    const player = state.players.player;

    expect(player.tokens).toEqual(INITIAL_TOKEN_POOL);
    expect(player.ammo).toBe(CANNON_STARTING_AMMO);
    expect(tokenEconomyOf(getShipType('sloop'))).toMatchObject({
      perTurn: 2,
      cap: 10,
      restBonus: 2,
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
      expect(tokenEconomyOf(bigger).perTurn).toBeGreaterThanOrEqual(tokenEconomyOf(smaller).perTurn);
      expect(bigger.supplyUse).toBeGreaterThan(smaller.supplyUse);
      expect(bigger.cargoCap).toBeGreaterThan(smaller.cargoCap);
    }
  });

  it('gives a ship its own reserve and hull', () => {
    const state = duelOf('galleon', 'brigantine');

    expect(totalTokens(state.players.player.tokens)).toBe(12);
    expect(totalTokens(state.players.enemy.tokens)).toBe(10);
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
    // From an empty hold, so the cap does not get in the way.
    expect(beginNextTurn(holding(duelOf('sloop'), empty)).produced.player).toHaveLength(2);
    expect(beginNextTurn(holding(duelOf('brigantine'), empty)).produced.player).toHaveLength(3);
  });

  it('follows the class mix, so a galleon turns less often than a sloop', () => {
    const grown = (type: string) => {
      let state = holding(duelOf(type), empty);
      for (let i = 0; i < 3; i += 1) {
        state = beginNextTurn(state).state;
      }
      return state.players.player.tokens;
    };
    const share = (tokens: { FORWARD: number; TURN_LEFT: number; TURN_RIGHT: number }) =>
      tokens.FORWARD / totalTokens(tokens);

    expect(share(grown('galleon'))).toBeGreaterThan(share(grown('sloop')));
    expect(grown('galleon').TURN_LEFT).toBeGreaterThanOrEqual(1);
    expect(grown('galleon').TURN_RIGHT).toBeGreaterThanOrEqual(1);
  });

  it('stops producing once the hold is full', () => {
    const nearlyFull = holding(duelOf('brigantine'), { FORWARD: 6, TURN_LEFT: 3, TURN_RIGHT: 2 });

    const next = beginNextTurn(nearlyFull);

    expect(next.produced.player).toHaveLength(1);
    expect(totalTokens(next.state.players.player.tokens)).toBe(12);

    const again = beginNextTurn(next.state);

    expect(again.produced.player).toEqual([]);
    expect(totalTokens(again.state.players.player.tokens)).toBe(12);
  });

  it('does not move the rotation on while the hold is full', () => {
    const full = holding(duelOf('brigantine'), { FORWARD: 6, TURN_LEFT: 3, TURN_RIGHT: 3 });

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

    expect(paid.produced.player).toHaveLength(4);
    expect(paid.state.players.player.restedLastTurn).toBe(false);
  });

  it('pays nothing extra after a turn with a move', () => {
    const resolved = resolveTurn(holding(duelOf('brigantine'), empty), {
      player: movingPlan,
      enemy: movingPlan,
    });

    expect(beginNextTurn(resolved.nextState).produced.player).toHaveLength(3);
  });

  it('pays a sloop the biggest rest bonus, and a galleon none', () => {
    const resolved = resolveTurn(holding(duelOf('sloop'), empty), {
      player: idlePlan,
      enemy: idlePlan,
    });

    expect(beginNextTurn(resolved.nextState).produced.player).toHaveLength(4);

    const galleon = resolveTurn(holding(duelOf('galleon'), empty), {
      player: idlePlan,
      enemy: idlePlan,
    });
    expect(beginNextTurn(galleon.nextState).produced.player).toHaveLength(4);
  });

  it('is still limited by the cap', () => {
    const resolved = resolveTurn(
      holding(duelOf('brigantine'), { FORWARD: 6, TURN_LEFT: 3, TURN_RIGHT: 2 }),
      { player: idlePlan, enemy: idlePlan },
    );

    const paid = beginNextTurn(resolved.nextState);

    expect(totalTokens(paid.state.players.player.tokens)).toBe(12);
  });
});
