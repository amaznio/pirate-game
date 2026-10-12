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
 */
export type Objective =
  | { readonly kind: 'survive'; readonly turns: number }
  | { readonly kind: 'salvage'; readonly target: number };

export type ObjectiveKind = Objective['kind'];

export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = ['survive', 'salvage'];

/** Default numbers when an objective is chosen from a menu (a solo run sets its own). */
export const DEFAULT_OBJECTIVES: Readonly<Record<ObjectiveKind, Objective>> = {
  survive: { kind: 'survive', turns: 8 },
  salvage: { kind: 'salvage', target: 2 },
};

/** How many pickups a salvage board holds. */
export function salvagePickupCount(target: number): number {
  return Math.max(1, 2 * target - 1);
}

/** Why a match with an objective ended as it did (absent for the usual last-team-standing end). */
export type OutcomeReason = 'survived' | 'salvaged' | 'objective_failed';
