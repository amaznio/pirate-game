import type { WeaponSide } from '../domain/Ship';

export interface ShipType {
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  /** Weapon type ids mounted on each broadside. */
  readonly broadsides: Readonly<Record<WeaponSide, string | null>>;
  /** Placeholder fill colour used until Scallywag sprites are wired up. */
  readonly color: number;
}

/**
 * Add new ship types here. Ship construction (Ship.ts / createGame.ts) reads
 * from this config; components never hardcode hull values.
 */
export const SHIP_TYPES: Readonly<Record<string, ShipType>> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    maxHp: 4,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x8b5a2b,
  },
};

export function getShipType(id: string): ShipType {
  const ship = SHIP_TYPES[id];
  if (!ship) {
    throw new Error(`Unknown ship type: ${id}`);
  }
  return ship;
}
