import { describe, expect, it } from 'vitest';
import { createGame } from '../../simulation/createGame';
import type { TokenInventory } from '../../domain/Action';
import { pos } from '../../domain/Position';
import { planEnemyActions } from '../simpleAI';
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
    tokenInventories: { ...base.tokenInventories, enemy },
  };
}

describe('enemy AI movement economy', () => {
  it('holds when it has no movement tokens', () => {
    const plan = planEnemyActions(withEnemyPool({}));
    expect(plan.movement).toEqual([null, null, null, null]);
  });

  it('only plans moves it can afford', () => {
    const plan = planEnemyActions(withEnemyPool({ FORWARD: 2 }));
    expect(plan.movement).toEqual(['FORWARD', 'FORWARD', null, null]);
  });

  it('never plans more moves than the pool holds', () => {
    const plan = planEnemyActions(
      withEnemyPool({ FORWARD: 1, TURN_LEFT: 1 }),
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
      tokenInventories: {
        ...base.tokenInventories,
        enemy: { FORWARD: 1, TURN_LEFT: 0, TURN_RIGHT: 1 },
      },
    };

    const plan = planEnemyActions(state);
    expect(plan.movement[0]).toBe('TURN_RIGHT');
  });
});
