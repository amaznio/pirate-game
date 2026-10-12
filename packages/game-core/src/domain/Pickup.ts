import type { Position } from './Position';
import { cellKey } from './Terrain';

/**
 * Something floating on the water that a ship picks up by ending a phase on
 * its cell: a barrel of cannonballs, a crate of movement tokens, or a plank
 * that mends the hull.
 */
export type PickupKind = 'barrel' | 'crate' | 'plank';

export const PICKUP_KINDS: readonly PickupKind[] = ['barrel', 'crate', 'plank'];

export interface Pickup {
  readonly kind: PickupKind;
}

/** Pickups by cell, keyed `"x,y"`. Cells without an entry hold nothing. */
export type PickupMap = Readonly<Record<string, Pickup>>;

export function pickupAt(
  pickups: PickupMap | undefined,
  position: Position,
): Pickup | undefined {
  return pickups?.[cellKey(position)];
}
