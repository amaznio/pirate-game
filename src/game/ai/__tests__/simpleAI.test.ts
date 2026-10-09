import { describe, expect, it } from 'vitest';
import { createGame } from '../../simulation/createGame';
import type { TokenInventory } from '../../domain/Action';
import { planEnemyActions } from '../simpleAI';

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
