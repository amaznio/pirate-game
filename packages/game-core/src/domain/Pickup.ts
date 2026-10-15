import type { Position } from './Position';
import { cellKey } from './Terrain';

/**
 * Something floating on the water that a ship picks up by ending a phase on
 * its cell: a barrel of cannonballs, a crate of movement tokens, or a plank
 * that mends the hull.
 */
/** The pickups that help a ship: cannonballs, tokens, hull. */
export type LootKind = 'barrel' | 'crate' | 'plank';

/** Every kind of pickup: the three above, and a treasure chest (worth its `value` to a ship's haul). */
export type PickupKind = LootKind | 'chest';

/** The kinds scattered by Loot and the salvage race (never the chest). */
export const PICKUP_KINDS: readonly LootKind[] = ['barrel', 'crate', 'plank'];

export interface Pickup {
  readonly kind: PickupKind;
  /** What a chest adds to the haul of the ship that takes it. */
  readonly value?: number;
}

/** Pickups by cell, keyed `"x,y"`. Cells without an entry hold nothing. */
export type PickupMap = Readonly<Record<string, Pickup>>;

export function pickupAt(
  pickups: PickupMap | undefined,
  position: Position,
): Pickup | undefined {
  return pickups?.[cellKey(position)];
}
