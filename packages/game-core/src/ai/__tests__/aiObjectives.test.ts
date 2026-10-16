import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { Objective } from '../../domain/Objective';
import type { PickupMap } from '../../domain/Pickup';
import { createDuelConfig } from '../../config/matchConfig';
import { createGame } from '../../simulation/createGame';
import { resolveTurn } from '../../simulation/resolveTurn';
import { planAiActions } from '../simpleAI';

/** An open-water duel with the enemy AI at (9,5) facing south. */
function duel(objective: Objective | undefined, pickups: PickupMap = {}): GameState {
  const base = createGame(createDuelConfig({ sea: 'open', aiDifficulty: 'normal' }));
  return {
    ...base,
    pickups,
    ...(objective === undefined ? {} : { objective }),
  };
}

function enemyCollects(state: GameState) {
  const plan = planAiActions(state, 'enemy');
  const result = resolveTurn(state, {
    enemy: plan,
    player: { movement: [null, null, null, null], cannons: [] },
  });
  return result.events.filter(
    (event) => event.type === 'PICKUP_COLLECTED' && event.shipId === 'enemy-ship',
  );
}

describe('the AI in a salvage race', () => {
  const salvage: Objective = { kind: 'salvage', target: 2 };
  // A plank beside the enemy's path: worth nothing to a ship with a whole hull.
  const planks: PickupMap = { '10,6': { kind: 'plank' }, '8,6': { kind: 'plank' } };

  it('does not collect cargo: that is for the hero team alone', () => {
    expect(enemyCollects(duel(undefined, planks))).toHaveLength(0);
    expect(enemyCollects(duel(salvage, planks))).toHaveLength(0);
  });

  it('heads for the cargo to guard when none is within reach this turn', () => {
    const far: PickupMap = { '9,11': { kind: 'barrel' }, '10,12': { kind: 'barrel' }, '2,2': { kind: 'crate' } };
    const state = duel(salvage, far);
    const plan = planAiActions(state, 'enemy');
    const next = resolveTurn(state, {
      enemy: plan,
      player: { movement: [null, null, null, null], cannons: [] },
    }).nextState;
    const before = Math.abs(9 - 9) + Math.abs(11 - 5);
    const after =
      Math.abs(next.ships['enemy-ship'].position.x - 9) +
      Math.abs(next.ships['enemy-ship'].position.y - 11);
    expect(after).toBeLessThan(before);
  });
});

describe('the AI in a survive match', () => {
  const survive: Objective = { kind: 'survive', turns: 6 };

  it('plays the hunters exactly as it always has', () => {
    // The enemy is not the hero team (the human is), so its plan is unchanged.
    expect(planAiActions(duel(survive), 'enemy')).toEqual(planAiActions(duel(undefined), 'enemy'));
  });

  it('plays the hero team more cautiously, and the same every time', () => {
    const base = duel(survive);
    const heroAi: GameState = {
      ...base,
      players: { ...base.players, player: { ...base.players.player, controller: 'ai' } },
    };
    const again = planAiActions(heroAi, 'player');
    expect(planAiActions(heroAi, 'player')).toEqual(again);
    // The hero holds back where a plain match would close the distance.
    const plain: GameState = {
      ...heroAi,
      objective: undefined,
    };
    const closing = (state: GameState): number => {
      const plan = planAiActions(state, 'player');
      const next = resolveTurn(state, {
        player: plan,
        enemy: { movement: [null, null, null, null], cannons: [] },
      }).nextState;
      const a = next.ships['player-ship'].position;
      const b = next.ships['enemy-ship'].position;
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    };
    expect(closing(heroAi)).toBeGreaterThanOrEqual(closing(plain));
  });
});
