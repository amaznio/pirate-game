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
 * is legal, stores it as their queues (spending the movement tokens it uses,
 * exactly as queueing them one by one would). Pure: it is what a server runs on
 * a plan received from a remote player, so nothing a client claims is trusted.
 *
 * Any plan the player had already queued is replaced; its tokens are refunded
 * before the new cost is checked.
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

  const tokens = cloneInventory(player.tokens);
  for (const action of player.queue) {
    if (action) {
      tokens[action] += 1;
    }
  }
  for (const action of plan.movement) {
    if (action) {
      tokens[action] -= 1;
      if (tokens[action] < 0) {
        return { ok: false, reason: 'not_enough_tokens' };
      }
    }
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
          tokens,
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
