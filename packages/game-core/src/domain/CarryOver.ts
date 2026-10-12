/**
 * A change a ship brings into a battle from earlier ones (an upgrade, say).
 * Only one kind exists so far: cannons that hit harder.
 */
export type Modifier = { readonly kind: 'cannonDamage'; readonly bonus: number };

/**
 * What one ship brings into a battle instead of the class defaults. Every part
 * is optional. Tokens are not carried: they start fresh each battle.
 *
 * This is only ever set by code that builds a match (tests, and later a solo
 * voyage). No URL, lobby option or socket message can set it, so nobody can edit
 * their way into a head start.
 */
export interface CarryOver {
  /** Starting hull, kept between 1 and the class maximum. */
  readonly hull?: number;
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
