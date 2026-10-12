import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { PickupMap } from '../../domain/Pickup';
import { createDuelConfig } from '../../config/matchConfig';
import { createGame } from '../../simulation/createGame';
import { resolveTurn } from '../../simulation/resolveTurn';
import { planAiActions } from '../simpleAI';

/** An open-water duel with the enemy AI at (9,5) facing south, plus the given pickups. */
function duel(pickups: PickupMap, tweak?: (state: GameState) => GameState): GameState {
  const base = createGame(createDuelConfig({ sea: 'open', aiDifficulty: 'normal' }));
  const state = { ...base, pickups };
  return tweak ? tweak(state) : state;
}

/** What the enemy picks up when it plays its own plan and the player stands still. */
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

describe('the AI and pickups', () => {
  it('turns aside for a plank when its hull is hurt, but not when it is whole', () => {
    const plank: PickupMap = { '10,6': { kind: 'plank' }, '8,6': { kind: 'plank' } };
    const hurt = duel(plank, (s) => ({
      ...s,
      ships: { ...s.ships, 'enemy-ship': { ...s.ships['enemy-ship'], hp: 1 } },
    }));
    expect(enemyCollects(hurt)).toHaveLength(1);
    expect(enemyCollects(duel(plank))).toHaveLength(0);
  });

  it('turns aside for a barrel when it is out of cannonballs', () => {
    const barrel: PickupMap = { '10,6': { kind: 'barrel' }, '8,6': { kind: 'barrel' } };
    const dry = duel(barrel, (s) => ({
      ...s,
      players: { ...s.players, enemy: { ...s.players.enemy, ammo: 0 } },
    }));
    expect(enemyCollects(dry)).toHaveLength(1);
  });

  it('plans the same as before when there is no loot', () => {
    const base = createGame(createDuelConfig({ sea: 'open', aiDifficulty: 'normal' }));
    expect(planAiActions({ ...base, pickups: {} }, 'enemy')).toEqual(planAiActions(base, 'enemy'));
  });
});
