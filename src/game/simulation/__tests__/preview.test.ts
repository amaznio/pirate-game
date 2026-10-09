import { describe, expect, it } from 'vitest';
import { emptyCannonQueue, emptyQueue } from '../../domain/Action';
import { previewPlayerPlan } from '../preview';
import { defaultEnemy, defaultPlayer, gameWith, rock } from './testUtils';

describe('previewPlayerPlan', () => {
  it('follows the queued moves and reports blocked steps', () => {
    const player = defaultPlayer({ position: { x: 5, y: 5 }, heading: 'NORTH' });
    const enemy = defaultEnemy({ position: { x: 15, y: 15 } });
    const base = gameWith(player, enemy, [rock('r', 5, 3)]);
    const queue = emptyQueue();
    queue[0] = 'FORWARD';
    queue[1] = 'FORWARD'; // blocked by the rock at (5, 3)
    const state = { ...base, queues: { ...base.queues, player: queue } };

    const preview = previewPlayerPlan(state)!;
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
    const state = { ...base, cannonQueues: { ...base.cannonQueues, player: cannons } };
    const ammoBefore = state.ammo.player;

    const preview = previewPlayerPlan(state)!;
    expect(preview.steps[0].shots).toHaveLength(1);
    expect(preview.steps[0].shots[0]).toMatchObject({ side: 'right', outcome: 'ship' });
    expect(state.ammo.player).toBe(ammoBefore);
  });
});
