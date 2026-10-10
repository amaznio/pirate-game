import type { MovementAction, TokenInventory } from '../domain/Action';
import type { WeaponSide } from '../domain/Ship';
import { DEFAULT_TOKEN_ECONOMY, type TokenEconomy } from './gameRules';

/**
 * How a ship type produces movement tokens. Every value is optional and falls
 * back to the classic rules (`DEFAULT_TOKEN_ECONOMY`, `INITIAL_TOKEN_POOL`), so
 * a type that sets nothing sails exactly like the original sloop.
 */
export interface ShipTokenStats {
  /** Tokens held at the start of a match. */
  readonly start?: TokenInventory;
  /** Tokens produced at the start of every turn. */
  readonly perTurn?: number;
  /** Most tokens held at once, all types together. */
  readonly cap?: number;
  /** Extra tokens produced after a turn in which the ship made no move. */
  readonly restBonus?: number;
  /** Order in which the auto-generated token types are produced. */
  readonly rotation?: readonly MovementAction[];
}

/**
 * How a ship type fires. Every value is optional and falls back to the classic
 * rules (one cannon a side, `CANNON_STARTING_AMMO`, `CANNON_RELOAD_AMOUNT`).
 */
export interface ShipCannonStats {
  /**
   * One cannon per entry on each broadside, as a lane (cells along the heading:
   * 0 abeam, +1 fore, -1 aft). The order is the firing order, so if cannonballs
   * run short the first lanes fire.
   */
  readonly lanes?: readonly number[];
  /** Cannonballs held at the start of a match. */
  readonly ammo?: number;
  /** Cannonballs reloaded each turn. */
  readonly reload?: number;
}

export interface ShipType {
  readonly id: string;
  readonly name: string;
  /** One line on what the ship is good at, shown when choosing a ship. */
  readonly description: string;
  readonly maxHp: number;
  /** Weapon type ids mounted on each broadside. */
  readonly broadsides: Readonly<Record<WeaponSide, string | null>>;
  /** Placeholder fill colour used until Scallywag sprites are wired up. */
  readonly color: number;
  readonly tokens?: ShipTokenStats;
  readonly cannons?: ShipCannonStats;
  /**
   * Voyage numbers for the roguelite run (not used by a battle): supplies spent
   * per leg of a route, and how many supplies the hold can carry.
   */
  readonly supplyUse: number;
  readonly cargoCap: number;
}

/**
 * Add new ship types here. Ship construction (Ship.ts / createGame.ts) reads
 * from this config; components never hardcode hull values.
 *
 * Bigger ships are stronger overall (the point of upgrading), but each keeps
 * its own feel: the sloop is the light, cheap-to-run baseline, the brigantine
 * the all-rounder, and the galleon a heavy hull that turns less often.
 */
export const SHIP_TYPES: Readonly<Record<string, ShipType>> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    description: 'Light and cheap to run. Sails with the classic rules.',
    maxHp: 4,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x8b5a2b,
    supplyUse: 1,
    cargoCap: 8,
  },
  brigantine: {
    id: 'brigantine',
    name: 'Brigantine',
    description: 'A sturdier all-rounder with a deeper token reserve.',
    maxHp: 5,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x6b4423,
    tokens: {
      start: { FORWARD: 4, TURN_LEFT: 2, TURN_RIGHT: 2 },
      perTurn: 2,
      cap: 10,
      restBonus: 1,
    },
    // Two cannons a side: one abeam and one forward.
    cannons: { lanes: [0, 1], ammo: 5, reload: 2 },
    supplyUse: 2,
    cargoCap: 12,
  },
  galleon: {
    id: 'galleon',
    name: 'Galleon',
    description: 'A heavy hull with a big reserve, but it turns less often.',
    maxHp: 6,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x4a2f1a,
    tokens: {
      start: { FORWARD: 6, TURN_LEFT: 2, TURN_RIGHT: 2 },
      perTurn: 2,
      cap: 12,
      restBonus: 1,
      rotation: ['FORWARD', 'FORWARD', 'TURN_LEFT', 'FORWARD', 'FORWARD', 'TURN_RIGHT'],
    },
    // Three cannons a side: abeam, forward and aft.
    cannons: { lanes: [0, 1, -1], ammo: 7, reload: 2 },
    supplyUse: 3,
    cargoCap: 18,
  },
};

export const DEFAULT_SHIP_TYPE_ID = 'sloop';

/** The lanes of a ship type's cannons on each side (one cannon abeam if unset). */
export function cannonLanesOf(type: ShipType): readonly number[] {
  return type.cannons?.lanes ?? [0];
}

export function getShipType(id: string): ShipType {
  const ship = SHIP_TYPES[id];
  if (!ship) {
    throw new Error(`Unknown ship type: ${id}`);
  }
  return ship;
}

/** A ship type's token rules with every gap filled from the classic rules. */
export function tokenEconomyOf(type: ShipType): TokenEconomy {
  const stats = type.tokens;
  return {
    perTurn: stats?.perTurn ?? DEFAULT_TOKEN_ECONOMY.perTurn,
    cap: stats?.cap ?? DEFAULT_TOKEN_ECONOMY.cap,
    restBonus: stats?.restBonus ?? DEFAULT_TOKEN_ECONOMY.restBonus,
    rotation: stats?.rotation ?? DEFAULT_TOKEN_ECONOMY.rotation,
  };
}
