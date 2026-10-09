import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import {
  beginNextTurn,
  reloadedAmmo,
  selectEnemyToken,
  selectNextToken,
  spendMovementTokens,
} from '../tokens';
import {
  CANNON_RELOAD_AMOUNT,
  CANNON_STARTING_AMMO,
} from '../../config/gameRules';

describe('token generation', () => {
  it('auto mode follows the deterministic rotation', () => {
    let state = createGame();
    const produced: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      const result = beginNextTurn(state);
      produced.push(result.token);
      state = result.state;
    }

    expect(produced).toEqual([
      'FORWARD',
      'TURN_LEFT',
      'FORWARD',
      'TURN_RIGHT',
    ]);
  });

  it('manual mode produces the requested token', () => {
    const state = {
      ...createGame(),
      tokenGeneration: {
        auto: false,
        requested: 'TURN_RIGHT' as const,
        rotationIndex: 0,
      },
    };

    expect(selectNextToken(state.tokenGeneration).token).toBe('TURN_RIGHT');
  });

  it('grants one token and advances the turn', () => {
    const state = createGame();
    const before = state.tokenInventories.player.FORWARD;

    const result = beginNextTurn(state);

    expect(result.token).toBe('FORWARD');
    expect(result.state.tokenInventories.player.FORWARD).toBe(before + 1);
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.state.status).toBe('planning');
  });
});

describe('cannonball reload', () => {
  it('reloads +1 for every completed turn', () => {
    expect(reloadedAmmo(1, 1)).toBe(1 + CANNON_RELOAD_AMOUNT);
    expect(reloadedAmmo(1, 5)).toBe(1 + CANNON_RELOAD_AMOUNT);
  });

  it('accumulates without an upper cap', () => {
    expect(reloadedAmmo(100, 1)).toBe(101);
  });

  it('clears the cannon queue when a new turn begins', () => {
    const state = createGame();
    const withShots = {
      ...state,
      cannonQueues: {
        ...state.cannonQueues,
        player: state.cannonQueues.player.map((slot, index) =>
          index === 0 ? { left: true, right: true } : slot,
        ),
      },
    };

    const result = beginNextTurn(withShots);

    expect(
      result.state.cannonQueues.player.every(
        (slot) => !slot.left && !slot.right,
      ),
    ).toBe(true);
  });

  it('starts with the configured ammo', () => {
    expect(createGame().ammo.player).toBe(CANNON_STARTING_AMMO);
  });
});

describe('enemy movement economy', () => {
  it('gives the enemy one token per new turn', () => {
    const state = createGame();
    const total = (inventory: {
      FORWARD: number;
      TURN_LEFT: number;
      TURN_RIGHT: number;
    }) => inventory.FORWARD + inventory.TURN_LEFT + inventory.TURN_RIGHT;

    const result = beginNextTurn(state);

    expect(total(result.state.tokenInventories.enemy)).toBe(
      total(state.tokenInventories.enemy) + 1,
    );
  });

  it('selectEnemyToken follows a deterministic rotation', () => {
    expect(selectEnemyToken(0)).toBe('FORWARD');
    expect(selectEnemyToken(1)).toBe('TURN_LEFT');
    expect(selectEnemyToken(2)).toBe('FORWARD');
    expect(selectEnemyToken(3)).toBe('TURN_RIGHT');
  });

  it('spends movement tokens and never goes negative', () => {
    const inventory = { FORWARD: 2, TURN_LEFT: 1, TURN_RIGHT: 0 };

    const spent = spendMovementTokens(inventory, [
      'FORWARD',
      'FORWARD',
      'FORWARD',
      null,
    ]);

    expect(spent).toEqual({ FORWARD: 0, TURN_LEFT: 1, TURN_RIGHT: 0 });
  });
});
