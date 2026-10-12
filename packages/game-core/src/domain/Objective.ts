import type { Direction } from './Direction';
import type { Position } from './Position';

/**
 * A way for a battle to end other than "last team standing". Every objective is
 * written from the side of the **hero team** (the humans' team; with no human in
 * the match, the first player's team). The others are the opposition. The usual
 * rule still applies on top: a team left alone afloat wins.
 *
 *  - `survive`: the hero team wins by still being afloat when turn `turns`
 *    ends; it loses if it is sunk first.
 *  - `salvage`: a race for the floating pickups. The match ends when a team has
 *    taken `target` of them, or when none are left afloat; the team that took
 *    the most wins (a tie is a draw). The board is given `2 * target - 1`
 *    pickups, so reaching the target means holding a majority.
 *  - `merchant`: an unarmed cargo ship makes for the `exit` edge of the board.
 *    The hero team wins by sinking it first. It loses if the merchant reaches
 *    the edge, gets clean away when turn `turns` ends, or the hero team is sunk.
 *    The merchant sails for the opposition (with any escorts), so it is never
 *    shot at by them and they are not shot at by it. `shipId` and `exit` are
 *    filled in when the match is built.
 */
export type Objective =
  | { readonly kind: 'survive'; readonly turns: number }
  | { readonly kind: 'salvage'; readonly target: number }
  | {
      readonly kind: 'merchant';
      /** Turns the merchant has to get away in. */
      readonly turns: number;
      /** The merchant's ship id, set when the match is built. */
      readonly shipId?: string;
      /** The edge of the board the merchant is making for, set when the match is built. */
      readonly exit?: Direction;
    };

export type ObjectiveKind = Objective['kind'];

export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = ['survive', 'salvage', 'merchant'];

/** Default numbers when an objective is chosen from a menu (a solo run sets its own). */
export const DEFAULT_OBJECTIVES: Readonly<Record<ObjectiveKind, Objective>> = {
  survive: { kind: 'survive', turns: 8 },
  salvage: { kind: 'salvage', target: 2 },
  merchant: { kind: 'merchant', turns: 12 },
};

/** The player id and ship id of the merchant in a merchant match. */
export const MERCHANT_PLAYER_ID = 'merchant';
export const MERCHANT_SHIP_ID = 'merchant-ship';
/** The team the merchant and every AI ship sail for in a merchant match. */
export const ESCORT_TEAM_ID = 'escort';

/** Where the merchant starts (the middle of the west edge) and which edge it makes for. */
export function merchantRoute(height: number): { spawn: Position; heading: Direction; exit: Direction } {
  return { spawn: { x: 1, y: Math.floor(height / 2) }, heading: 'EAST', exit: 'EAST' };
}

/** How many pickups a salvage board holds. */
export function salvagePickupCount(target: number): number {
  return Math.max(1, 2 * target - 1);
}

/** Why a match with an objective ended as it did (absent for the usual last-team-standing end). */
export type OutcomeReason =
  | 'survived'
  | 'salvaged'
  | 'objective_failed'
  | 'intercepted'
  | 'escaped';
