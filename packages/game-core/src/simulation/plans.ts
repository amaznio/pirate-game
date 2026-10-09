import type { GameState } from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions } from '../domain/TurnResult';
import {
  ACTIONS_PER_TURN,
  MOVEMENT_ACTIONS,
  cloneInventory,
  totalQueuedShots,
} from '../domain/Action';

export type PlanRejection =
  | 'unknown_player'
  | 'not_planning'
  | 'already_locked_in'
  | 'malformed_plan'
  | 'not_enough_tokens'
  | 'not_enough_ammo';

export type PlanResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: PlanRejection };

/**
 * Validates a complete plan against what the player actually holds and, if it
 * is legal, stores it as their queues. Movement tokens are NOT spent here: the
 * plan is only a draft until the turn resolves (see spendMovementTokens), so a
 * player can keep changing it. Pure: it is what a server runs on a plan
 * received from a remote player, so nothing a client claims is trusted.
 */
export function applyPlayerPlan(
  state: GameState,
  playerId: PlayerId,
  plan: PlayerActions,
): PlanResult {
  const player = state.players[playerId];
  if (!player) {
    return { ok: false, reason: 'unknown_player' };
  }
  if (state.status !== 'planning') {
    return { ok: false, reason: 'not_planning' };
  }
  if (player.lockedIn) {
    return { ok: false, reason: 'already_locked_in' };
  }

  const wellFormed =
    plan.movement.length === ACTIONS_PER_TURN &&
    plan.cannons.length === ACTIONS_PER_TURN &&
    plan.movement.every(
      (slot) => slot === null || MOVEMENT_ACTIONS.includes(slot),
    ) &&
    plan.cannons.every(
      (slot) => typeof slot.left === 'boolean' && typeof slot.right === 'boolean',
    );
  if (!wellFormed) {
    return { ok: false, reason: 'malformed_plan' };
  }

  const cost = cloneInventory({ FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 });
  for (const action of plan.movement) {
    if (action) {
      cost[action] += 1;
    }
  }
  if (MOVEMENT_ACTIONS.some((action) => cost[action] > player.tokens[action])) {
    return { ok: false, reason: 'not_enough_tokens' };
  }

  if (totalQueuedShots(plan.cannons) > player.ammo) {
    return { ok: false, reason: 'not_enough_ammo' };
  }

  return {
    ok: true,
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          queue: [...plan.movement],
          cannonQueue: plan.cannons.map((slot) => ({
            left: slot.left,
            right: slot.right,
          })),
        },
      },
    },
  };
}
