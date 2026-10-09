import { describe, expect, it } from 'vitest';
import { emptyCannonQueue, emptyQueue } from '../../domain/Action';
import { previewPlayerPlan } from '../preview';
import type { GameState, PlayerState } from '../../domain/GameState';
import { defaultEnemy, defaultPlayer, gameWith, rock } from './testUtils';

function withQueue(
  state: GameState,
  playerId: string,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], ...patch },
    },
  };
}

describe('previewPlayerPlan', () => {
  it('follows the queued moves and reports blocked steps', () => {
    const player = defaultPlayer({ position: { x: 5, y: 5 }, heading: 'NORTH' });
    const enemy = defaultEnemy({ position: { x: 15, y: 15 } });
    const base = gameWith(player, enemy, [rock('r', 5, 3)]);
    const queue = emptyQueue();
    queue[0] = 'FORWARD';
    queue[1] = 'FORWARD'; // blocked by the rock at (5, 3)
    const state = withQueue(base, 'player', { queue });

    const preview = previewPlayerPlan(state, 'player')!;
    expect(preview.steps[0]).toMatchObject({ position: { x: 5, y: 4 }, blocked: false });
    expect(preview.steps[1]).toMatchObject({ position: { x: 5, y: 4 }, blocked: true });
    expect(preview.steps[2].hasMove).toBe(false);
  });

  it('reports shots with their outcome and does not mutate the state', () => {
    const player = defaultPlayer({ position: { x: 5, y: 5 }, heading: 'NORTH' });
    const enemy = defaultEnemy({ position: { x: 7, y: 5 } });
    const base = gameWith(player, enemy);
    const cannons = emptyCannonQueue();
    cannons[0] = { left: false, right: true };
    const state = withQueue(base, 'player', { cannonQueue: cannons });
    const ammoBefore = state.players.player.ammo;

    const preview = previewPlayerPlan(state, 'player')!;
    expect(preview.steps[0].shots).toHaveLength(1);
    expect(preview.steps[0].shots[0]).toMatchObject({ side: 'right', outcome: 'ship' });
    expect(state.players.player.ammo).toBe(ammoBefore);
  });
});
