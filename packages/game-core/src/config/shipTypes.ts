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
   * Cannons on each broadside. They all fire from the ship's own cell along the
   * same line, one after the other, each costing a cannonball and dealing the
   * weapon's damage; if cannonballs run short the first ones fire.
   */
  readonly count?: number;
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
  /** False for a ship that only the game sails (the merchant): kept out of every ship choice. */
  readonly playable?: boolean;
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
    description: 'Light and cheap to run, with the smallest token reserve.',
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
      start: { FORWARD: 5, TURN_LEFT: 3, TURN_RIGHT: 2 },
      perTurn: 3,
      cap: 12,
      restBonus: 1,
    },
    cannons: { count: 2, ammo: 4, reload: 1 },
    supplyUse: 2,
    cargoCap: 12,
  },
  galleon: {
    id: 'galleon',
    name: 'Galleon',
    description: 'A heavy hull that covers ground fast, but turns less often.',
    maxHp: 6,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x4a2f1a,
    tokens: {
      start: { FORWARD: 8, TURN_LEFT: 2, TURN_RIGHT: 2 },
      perTurn: 4,
      cap: 14,
      restBonus: 0,
      // Four a turn, and every turn brings three forward and one turn: it covers
      // ground but swings round slowly.
      rotation: [
        'FORWARD',
        'FORWARD',
        'FORWARD',
        'TURN_LEFT',
        'FORWARD',
        'FORWARD',
        'FORWARD',
        'TURN_RIGHT',
      ],
    },
    cannons: { count: 3, ammo: 5, reload: 1 },
    supplyUse: 3,
    cargoCap: 18,
  },
  raider: {
    id: 'raider',
    name: 'Raider',
    description: 'A light pirate sloop sent to ambush you.',
    maxHp: 2,
    broadsides: { left: 'lightCannon', right: 'lightCannon' },
    color: 0x6e2f2f,
    supplyUse: 1,
    cargoCap: 4,
    playable: false,
  },
  merchantman: {
    id: 'merchantman',
    name: 'Merchantman',
    description: 'An unarmed cargo ship making a run for the edge of the map.',
    maxHp: 3,
    broadsides: { left: null, right: null },
    color: 0x9a8f6e,
    tokens: {
      // Slow on purpose: about a cell a turn after its first few, so there is a chase.
      start: { FORWARD: 4, TURN_LEFT: 1, TURN_RIGHT: 1 },
      perTurn: 1,
      cap: 10,
      restBonus: 0,
      rotation: ['FORWARD', 'FORWARD', 'FORWARD', 'TURN_LEFT', 'FORWARD', 'FORWARD', 'FORWARD', 'TURN_RIGHT'],
    },
    cannons: { count: 0, ammo: 0, reload: 0 },
    supplyUse: 2,
    cargoCap: 24,
    playable: false,
  },
};

export const DEFAULT_SHIP_TYPE_ID = 'sloop';

/** The class of the unarmed cargo ship in a merchant match. */
export const MERCHANT_SHIP_TYPE_ID = 'merchantman';

/** The class of the raiders in an ambush: lighter than a sloop, so a lone hero stands a chance. */
export const RAIDER_SHIP_TYPE_ID = 'raider';

/** Whether players can pick this class (the merchant cannot). */
export function isPlayableShipType(id: string): boolean {
  return Object.hasOwn(SHIP_TYPES, id) && SHIP_TYPES[id].playable !== false;
}

/** The classes players can pick, smallest first. */
export function playableShipTypeIds(): string[] {
  return Object.values(SHIP_TYPES)
    .filter((type) => type.playable !== false)
    .map((type) => type.id);
}

/** How many cannons a ship type has on each side (one if unset). */
export function cannonsPerSideOf(type: ShipType): number {
  return type.cannons?.count ?? 1;
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
