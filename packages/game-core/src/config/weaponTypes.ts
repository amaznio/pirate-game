export interface WeaponType {
  readonly id: string;
  readonly name: string;
  readonly damage: number;
  /** Maximum number of tiles the shot travels. */
  readonly range: number;
}

/**
 * Add new weapons here. The simulation reads damage/range from this config,
 * so no combat rules are hardcoded in components or scenes.
 */
export const WEAPON_TYPES: Readonly<Record<string, WeaponType>> = {
  lightCannon: {
    id: 'lightCannon',
    name: 'Light Cannon',
    damage: 1,
    range: 3,
  },
};

export function getWeaponType(id: string): WeaponType {
  const weapon = WEAPON_TYPES[id];
  if (!weapon) {
    throw new Error(`Unknown weapon type: ${id}`);
  }
  return weapon;
}
