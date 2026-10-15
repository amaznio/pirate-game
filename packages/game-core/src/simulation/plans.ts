import type { GameState } from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions } from '../domain/TurnResult';
import {
  ACTIONS_PER_TURN,
  MOVEMENT_ACTIONS,
  cloneInventory,
} from '../domain/Action';
import { ONE_CANNON_A_SIDE, cannonCountsOf, cannonQueueCost } from '../domain/Ship';

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
      (slot) =>
        Number.isInteger(slot.left) &&
        Number.isInteger(slot.right) &&
        slot.left >= 0 &&
        slot.right >= 0,
    );
  // Leaving is only a thing in a hunt.
  if (!wellFormed || (plan.leave && state.objective?.kind !== 'hunt')) {
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

  // A phase cannot ask for more cannons than a side has.
  const ship = state.ships[player.shipId];
  const counts = ship ? cannonCountsOf(ship) : ONE_CANNON_A_SIDE;
  if (plan.cannons.some((slot) => slot.left > counts.left || slot.right > counts.right)) {
    return { ok: false, reason: 'malformed_plan' };
  }
  if (cannonQueueCost(plan.cannons, counts) > player.ammo) {
    return { ok: false, reason: 'not_enough_ammo' };
  }

  return {
    ok: true,
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...omitLeaving(player),
          ...(plan.leave ? { leaving: true } : {}),
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

function omitLeaving<T extends { leaving?: boolean }>(player: T): Omit<T, 'leaving'> {
  const { leaving: _leaving, ...rest } = player;
  return rest;
}
