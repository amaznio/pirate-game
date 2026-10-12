import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import {
  beginNextTurn,
  reloadedAmmo,
  selectNextToken,
  spendMovementTokens,
} from '../tokens';
import {
  CANNON_RELOAD_AMOUNT,
  CANNON_STARTING_AMMO,
} from '../../config/gameRules';

describe('token generation', () => {
  it('auto mode makes the type it is most short of, in a deterministic order', () => {
    // From an empty hold, so every token made shows (the cap would stop them otherwise).
    const base = createGame();
    let state: ReturnType<typeof createGame> = {
      ...base,
      players: {
        ...base.players,
        player: { ...base.players.player, tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 } },
      },
    };
    const produced: string[] = [];

    for (let i = 0; i < 2; i += 1) {
      const result = beginNextTurn(state);
      produced.push(...result.produced.player);
      state = result.state;
    }

    // The sloop makes two a turn. Each is the type it is most short of, the class
    // order breaking ties: forward, then left, then right, then forward again.
    expect(produced).toEqual([
      'FORWARD',
      'TURN_LEFT',
      'TURN_RIGHT',
      'FORWARD',
    ]);
  });

  it('manual mode produces the requested token', () => {
    const generation = {
      auto: false,
      requested: 'TURN_RIGHT' as const,
      rotationIndex: 0,
    };

    expect(selectNextToken(generation).token).toBe('TURN_RIGHT');
  });

  it('grants one token and advances the turn', () => {
    const state = createGame();
    const before = state.players.player.tokens.FORWARD;

    const result = beginNextTurn(state);

    expect(result.tokens.player).toBe('FORWARD');
    expect(result.state.players.player.tokens.FORWARD).toBe(before + 1);
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.state.status).toBe('planning');
  });

  it('each player produces a token from their own settings', () => {
    const base = createGame();
    const state = {
      ...base,
      players: {
        ...base.players,
        player: {
          ...base.players.player,
          tokenGeneration: {
            auto: false,
            requested: 'TURN_RIGHT' as const,
            rotationIndex: 0,
          },
        },
      },
    };

    const result = beginNextTurn(state);

    expect(result.tokens.player).toBe('TURN_RIGHT');
    expect(result.tokens.enemy).toBe('FORWARD');
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

  it('clears every cannon queue when a new turn begins', () => {
    const state = createGame();
    const shots = state.players.player.cannonQueue.map((slot, index) =>
      index === 0 ? { left: 1, right: 1 } : slot,
    );
    const withShots = {
      ...state,
      players: {
        ...state.players,
        player: { ...state.players.player, cannonQueue: shots },
      },
    };

    const result = beginNextTurn(withShots);

    for (const player of Object.values(result.state.players)) {
      expect(player.cannonQueue.every((slot) => !slot.left && !slot.right)).toBe(
        true,
      );
    }
  });

  it('starts with the configured ammo', () => {
    expect(createGame().players.player.ammo).toBe(CANNON_STARTING_AMMO);
  });
});

describe('movement economy', () => {
  it('gives every player the sloop income each new turn, up to the cap', () => {
    const state = createGame();
    const total = (inventory: {
      FORWARD: number;
      TURN_LEFT: number;
      TURN_RIGHT: number;
    }) => inventory.FORWARD + inventory.TURN_LEFT + inventory.TURN_RIGHT;

    const result = beginNextTurn(state);

    for (const id of Object.keys(state.players)) {
      expect(total(result.state.players[id].tokens)).toBe(
        total(state.players[id].tokens) + 2,
      );
    }
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
