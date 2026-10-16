/**
 * A change a ship brings into a battle from earlier ones (an upgrade, say).
 * Two kinds exist: cannons that hit harder, and cannonballs that reload faster.
 */
export type Modifier =
  | { readonly kind: 'cannonDamage'; readonly bonus: number }
  | { readonly kind: 'reload'; readonly bonus: number };

/**
 * What one ship brings into a battle instead of the class defaults. Every part
 * is optional. Tokens are not carried: they start fresh each battle.
 *
 * This is only ever set by code that builds a match (tests, and later a solo
 * voyage). No URL, lobby option or socket message can set it, so nobody can edit
 * their way into a head start.
 */
export interface CarryOver {
  /** Starting hull, kept between 1 and the ship's maximum hull. */
  readonly hull?: number;
  /**
   * The ship's maximum hull, in place of its class's own (a whole number from 1
   * to `CARRY_MAX_HULL`). A solo voyage grows a ship this way. Absent, the class
   * decides.
   */
  readonly maxHull?: number;
  /**
   * Cannons on each side, in place of the class's own (a whole number from 1 to
   * `CARRY_MAX_CANNONS`). Absent, the class decides.
   */
  readonly cannonsPerSide?: number;
  /** Starting cannonballs (never below 0). */
  readonly ammo?: number;
  readonly modifiers?: readonly Modifier[];
}

/** The extra damage each cannon of a ship does, from its modifiers. */
export function cannonDamageBonus(modifiers: readonly Modifier[] | undefined): number {
  return (modifiers ?? []).reduce(
    (total, modifier) => (modifier.kind === 'cannonDamage' ? total + Math.max(0, modifier.bonus) : total),
    0,
  );
}

/** The extra cannonballs a ship reloads each turn, from its modifiers (a whole number, 0 to `CARRY_MAX_RELOAD`). */
export function reloadBonus(modifiers: readonly Modifier[] | undefined): number {
  const total = (modifiers ?? []).reduce(
    (sum, modifier) => (modifier.kind === 'reload' ? sum + Math.max(0, Math.round(modifier.bonus)) : sum),
    0,
  );
  return Math.min(CARRY_MAX_RELOAD, total);
}

/** The most extra cannonballs a carried ship can reload each turn. */
export const CARRY_MAX_RELOAD = 3;

/** The most hull a carried ship can have, and the most cannons on a side. */
export const CARRY_MAX_HULL = 20;
export const CARRY_MAX_CANNONS = 4;

/** A carried maximum hull held to what the game allows: a whole number from 1 to the limit. */
export function carriedMaxHull(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.min(CARRY_MAX_HULL, Math.max(1, Math.round(value)));
}

/** A carried cannon count held to what the game allows: a whole number from 1 to the limit. */
export function carriedCannons(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.min(CARRY_MAX_CANNONS, Math.max(1, Math.round(value)));
}
