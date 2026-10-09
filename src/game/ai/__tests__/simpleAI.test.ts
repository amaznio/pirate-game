import { describe, expect, it } from 'vitest';
import { createGame } from '../../simulation/createGame';
import type { TokenInventory } from '../../domain/Action';
import type { Direction } from '../../domain/Direction';
import { pos } from '../../domain/Position';
import { createSkirmishConfig } from '../../config/matchConfig';
import { planAiActions } from '../simpleAI';
import {
  defaultEnemy,
  defaultPlayer,
  gameWith,
} from '../../simulation/__tests__/testUtils';

function withEnemyPool(pool: Partial<TokenInventory>) {
  const base = createGame();
  const enemy: TokenInventory = {
    FORWARD: 0,
    TURN_LEFT: 0,
    TURN_RIGHT: 0,
    ...pool,
  };
  return {
    ...base,
    players: {
      ...base.players,
      enemy: { ...base.players.enemy, tokens: enemy },
    },
  };
}

describe('enemy AI movement economy', () => {
  it('holds when it has no movement tokens', () => {
    const plan = planAiActions(withEnemyPool({}), 'enemy');
    expect(plan.movement).toEqual([null, null, null, null]);
  });

  it('only plans moves it can afford', () => {
    const plan = planAiActions(withEnemyPool({ FORWARD: 2 }), 'enemy');
    expect(plan.movement).toEqual(['FORWARD', 'FORWARD', null, null]);
  });

  it('never plans more moves than the pool holds', () => {
    const plan = planAiActions(
      withEnemyPool({ FORWARD: 1, TURN_LEFT: 1 }),
      'enemy',
    );
    const used = plan.movement.filter((action) => action !== null).length;
    expect(used).toBeLessThanOrEqual(2);
  });
});

describe('enemy AI uses the real movement rules', () => {
  it('values a turn that is only partly possible', () => {
    // On the east edge a right turn advances one cell and rotates east even
    // though the sideways cell is off the board. That lines the left broadside
    // up with the player two cells north.
    const player = defaultPlayer({ position: pos(19, 3), heading: 'SOUTH' });
    const enemy = defaultEnemy({
      position: pos(19, 6),
      heading: 'NORTH',
      weapons: createGame().ships['enemy-ship'].weapons,
    });
    const base = gameWith(player, enemy);
    const state = {
      ...base,
      players: {
        ...base.players,
        enemy: {
          ...base.players.enemy,
          tokens: { FORWARD: 1, TURN_LEFT: 0, TURN_RIGHT: 1 },
        },
      },
    };

    const plan = planAiActions(state, 'enemy');
    expect(plan.movement[0]).toBe('TURN_RIGHT');
  });
});

describe('AI with several ships', () => {
  const arena = () => {
    const base = createGame(
      createSkirmishConfig({ humans: 2, ais: 2, teamMode: 'teams' }),
    );
    // p2 (team-b, AI) is the ship under test and holds no movement tokens, so
    // it stays put. p1 and p3 are hostile; p4 is its teammate.
    const place = (id: string, x: number, y: number, heading: Direction) => ({
      ...base.ships[`${id}-ship`],
      position: pos(x, y),
      heading,
    });
    return {
      ...base,
      obstacles: {},
      ships: {
        'p1-ship': place('p1', 7, 10, 'SOUTH'),
        'p2-ship': place('p2', 10, 10, 'NORTH'),
        'p3-ship': place('p3', 17, 17, 'NORTH'),
        'p4-ship': place('p4', 13, 10, 'NORTH'),
      },
      players: {
        ...base.players,
        p2: {
          ...base.players.p2,
          tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 },
        },
      },
    };
  };

  it('shoots a hostile ship in its broadside', () => {
    const plan = planAiActions(arena(), 'p2');
    expect(plan.cannons.some((slot) => slot.left)).toBe(true);
  });

  it('never aims at a teammate', () => {
    const plan = planAiActions(arena(), 'p2');
    expect(plan.cannons.some((slot) => slot.right)).toBe(false);
  });

  it('passes when no hostile ship is left', () => {
    const state = arena();
    const dead = {
      ...state,
      ships: {
        ...state.ships,
        'p1-ship': { ...state.ships['p1-ship'], hp: 0 },
        'p3-ship': { ...state.ships['p3-ship'], hp: 0 },
      },
    };
    expect(planAiActions(dead, 'p2')).toEqual({ movement: [], cannons: [] });
  });
});
