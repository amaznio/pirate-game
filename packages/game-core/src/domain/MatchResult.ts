import type { PlayerId, TeamId } from './Entity';
import type { Outcome } from './GameState';
import type { PickupKind } from './Pickup';

/** How many of each pickup a ship took during a match. */
export type PickupTally = Readonly<Record<PickupKind, number>>;

export const EMPTY_PICKUP_TALLY: PickupTally = { barrel: 0, crate: 0, plank: 0 };

/** How one ship finished a match. */
export interface ShipResult {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly teamId: TeamId;
  readonly shipTypeId: string;
  readonly hull: number;
  readonly maxHull: number;
  readonly afloat: boolean;
  /** Cannonballs left in the pool. */
  readonly ammo: number;
  /** Movement tokens left (they do not carry over: each battle starts fresh). */
  readonly tokens: number;
  readonly pickups: PickupTally;
}

/**
 * What a finished match amounts to: how it ended and how every ship stands.
 * It is built from the final state alone, so a host, a replay and a test all
 * get the same answer. A solo voyage reads it to carry hull and ammo into the
 * next battle (see `CarryOver`).
 */
export interface MatchResult {
  readonly outcome: Outcome;
  /** Turns played, the last one included. */
  readonly turns: number;
  /** Every ship, in seat order. */
  readonly ships: readonly ShipResult[];
}
