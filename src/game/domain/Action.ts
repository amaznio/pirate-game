/**
 * Movement actions the player accumulates as tokens and spends on a movement
 * slot each turn. Kept intentionally tiny for the vertical slice.
 */
export type MovementAction = 'FORWARD' | 'TURN_LEFT' | 'TURN_RIGHT';

export const MOVEMENT_ACTIONS: readonly MovementAction[] = [
  'FORWARD',
  'TURN_LEFT',
  'TURN_RIGHT',
];

/** Planned phases per turn (shared by the movement and cannon queues). */
export const ACTIONS_PER_TURN = 4;

/** A queued movement slot: either an action or an empty slot. */
export type ActionSlot = MovementAction | null;

/** Exactly ACTIONS_PER_TURN entries; null means empty. */
export type ActionQueue = readonly ActionSlot[];

export function emptyQueue(): ActionSlot[] {
  return Array.from({ length: ACTIONS_PER_TURN }, () => null);
}

/** How many of each movement token the player currently holds. */
export type TokenInventory = Record<MovementAction, number>;

export function emptyTokenInventory(): TokenInventory {
  return { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };
}

export function cloneInventory(inventory: TokenInventory): TokenInventory {
  return {
    FORWARD: inventory.FORWARD,
    TURN_LEFT: inventory.TURN_LEFT,
    TURN_RIGHT: inventory.TURN_RIGHT,
  };
}

export function totalTokens(inventory: TokenInventory): number {
  return inventory.FORWARD + inventory.TURN_LEFT + inventory.TURN_RIGHT;
}

/** The two broadsides a cannon move can fire from. */
export type CannonSide = 'left' | 'right';

export const CANNON_SIDES: readonly CannonSide[] = ['left', 'right'];

/** One cannon move: which broadside(s) fire during that phase. */
export interface CannonSlot {
  readonly left: boolean;
  readonly right: boolean;
}

/** Exactly ACTIONS_PER_TURN entries, one per phase. */
export type CannonQueue = readonly CannonSlot[];

export function emptyCannonSlot(): CannonSlot {
  return { left: false, right: false };
}

export function emptyCannonQueue(): CannonSlot[] {
  return Array.from({ length: ACTIONS_PER_TURN }, () => emptyCannonSlot());
}

export function cannonSlotIsEmpty(slot: CannonSlot): boolean {
  return !slot.left && !slot.right;
}

/** A shot costs one cannonball per broadside, so "both" costs two. */
export function countCannonShots(slot: CannonSlot): number {
  return (slot.left ? 1 : 0) + (slot.right ? 1 : 0);
}

export function totalQueuedShots(queue: CannonQueue): number {
  return queue.reduce((total, slot) => total + countCannonShots(slot), 0);
}
