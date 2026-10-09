import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '../domain/Action';
import {
  cloneInventory,
  emptyCannonQueue,
  emptyQueue,
  totalQueuedShots,
} from '../domain/Action';
import type { PlayerActions } from '../domain/TurnResult';

/**
 * The plan a player is still working on. It lives on the client: editing it
 * never needs the host. It becomes a real plan only when it is sent (the host
 * validates it against what the player actually holds).
 */
export type PlanDraft = PlayerActions;

export function emptyDraft(): PlanDraft {
  return { movement: emptyQueue(), cannons: emptyCannonQueue() };
}

export function copyDraft(plan: PlayerActions): PlanDraft {
  return {
    movement: [...plan.movement],
    cannons: plan.cannons.map((slot) => ({ ...slot })),
  };
}

export function draftIsEmpty(draft: PlanDraft): boolean {
  return (
    draft.movement.every((slot) => slot === null) &&
    draft.cannons.every((slot) => !slot.left && !slot.right)
  );
}

/** The movement tokens a draft would spend. */
export function draftTokenCost(movement: readonly ActionSlot[]): TokenInventory {
  const cost = cloneInventory({ FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 });
  for (const action of movement) {
    if (action) {
      cost[action] += 1;
    }
  }
  return cost;
}

/** Tokens still free to queue: what the player holds minus what the draft uses. */
export function remainingTokens(
  pool: TokenInventory,
  draft: PlanDraft,
): TokenInventory {
  const cost = draftTokenCost(draft.movement);
  return {
    FORWARD: pool.FORWARD - cost.FORWARD,
    TURN_LEFT: pool.TURN_LEFT - cost.TURN_LEFT,
    TURN_RIGHT: pool.TURN_RIGHT - cost.TURN_RIGHT,
  };
}

/** Cannonballs still free to queue. */
export function remainingAmmo(ammo: number, cannons: CannonQueue): number {
  return ammo - totalQueuedShots(cannons);
}

/**
 * Puts a token into a movement slot: the requested slot if it is empty,
 * otherwise the first empty slot. Returns the same draft when nothing can be
 * done (no token left, or no free slot).
 */
export function queueToken(
  draft: PlanDraft,
  pool: TokenInventory,
  action: MovementAction,
  slot?: number,
): PlanDraft {
  if (remainingTokens(pool, draft)[action] <= 0) {
    return draft;
  }
  const movement = [...draft.movement];
  const target =
    slot !== undefined &&
    slot >= 0 &&
    slot < movement.length &&
    movement[slot] === null
      ? slot
      : movement.indexOf(null);
  if (target === -1) {
    return draft;
  }
  movement[target] = action;
  return { ...draft, movement };
}

/** Empties a movement slot. */
export function removeToken(draft: PlanDraft, index: number): PlanDraft {
  if (!draft.movement[index]) {
    return draft;
  }
  const movement = [...draft.movement];
  movement[index] = null;
  return { ...draft, movement };
}

/** Turns one broadside on or off for a phase (on only if a cannonball is free). */
export function toggleCannon(
  draft: PlanDraft,
  ammo: number,
  phase: number,
  side: CannonSide,
): PlanDraft {
  const current = draft.cannons[phase];
  if (!current) {
    return draft;
  }
  if (!current[side] && remainingAmmo(ammo, draft.cannons) <= 0) {
    return draft;
  }
  const cannons = draft.cannons.map((slot, index) =>
    index === phase ? { ...slot, [side]: !slot[side] } : slot,
  );
  return { ...draft, cannons };
}
