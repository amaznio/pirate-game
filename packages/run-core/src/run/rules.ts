import { CANNON_STARTING_AMMO } from '@pirate/game-core/config/gameRules';
import { getShipType, type ShipType } from '@pirate/game-core/config/shipTypes';
import type { BattleKind } from '../graph/types';
import type { UpgradeId } from './types';

/**
 * The numbers of the solo voyage. Starting guesses: the balance harness (roadmap
 * phase 7, slice E) is what tunes them, so keep them here and nowhere else.
 */

/** The class every run starts in. */
export const START_SHIP_TYPE_ID = 'sloop';

/** The ship classes a run climbs through, smallest first, and the hull level that unlocks each. */
export const CLASS_LADDER: ReadonlyArray<{ readonly shipTypeId: string; readonly fromLevel: number }> = [
  { shipTypeId: 'sloop', fromLevel: 0 },
  { shipTypeId: 'brigantine', fromLevel: 2 },
  { shipTypeId: 'galleon', fromLevel: 4 },
];

/** The highest hull level: the fully upgraded ship. */
export const HULL_LEVEL_CAP = 6;

/** The class a ship of this hull level sails as. */
export function classForHullLevel(level: number): ShipType {
  let id = CLASS_LADDER[0]!.shipTypeId;
  for (const step of CLASS_LADDER) {
    if (level >= step.fromLevel) {
      id = step.shipTypeId;
    }
  }
  return getShipType(id);
}

/** Maximum hull at a hull level: the Sloop's hull plus one a level. */
export function maxHullFor(level: number): number {
  return getShipType(START_SHIP_TYPE_ID).maxHp + level;
}

/** Cannons on each side at the start of a run, whatever the class; upgrades add more. */
export const START_CANNONS_PER_SIDE = 1;
export const CANNONS_PER_SIDE_CAP = 3;

/** The most extra cannonballs a ship can reload each turn from upgrades. */
export const RELOAD_BONUS_CAP = 2;

/** The most extra damage a cannon can have from upgrades. */
export const CANNON_DAMAGE_CAP = 2;

/** Cannonballs the Sloop starts with, and what "restock" fills back up to (plus upgrades). */
export const START_AMMO = getShipType(START_SHIP_TYPE_ID).cannons?.ammo ?? CANNON_STARTING_AMMO;

/** Cannonballs the ship refills to at a port: the class's own stock plus upgrades. */
export function ammoFullFor(level: number, ammoBonus: number): number {
  return (classForHullLevel(level).cannons?.ammo ?? CANNON_STARTING_AMMO) + ammoBonus;
}

/** How much one "cannonballs" upgrade adds to the stock, for good and right now. */
export const CANNONBALLS_UPGRADE = 2;
/** What the repair upgrade mends. */
export const REPAIR_UPGRADE = 2;

/** What a port does for the ship on arrival, free; a landfall (the start of an area) does more. */
export const PORT_REPAIR = 2;
export const LANDFALL_REPAIR = 4;

/**
 * Plunder is the voyage's money: fights and treasure pay it, ports sell upgrades for it.
 * The ship sets out with enough for one hull upgrade.
 */
export const START_PLUNDER = 8;

/** What each upgrade costs in plunder. Starting guesses: a full ship (about 100) is just within a voyage's means. */
export const UPGRADE_PRICE: Readonly<Record<UpgradeId, number>> = {
  repair: 4,
  cannonballs: 5,
  quickLoaders: 14,
  reinforceHull: 8,
  addCannon: 12,
  cannonDamage: 16,
};

/** Plunder a won battle pays; a merchant or an ambush pays the most, a boss more still. */
export const BATTLE_REWARD: Readonly<Record<BattleKind | 'boss' | 'hunt', number>> = {
  standard: 3,
  survive: 4,
  salvage: 4,
  merchant: 6,
  ambush: 6,
  boss: 8,
  hunt: 1,
};

/**
 * What a hunt pays on top of that: each this many treasure banked is one plunder (a
 * full clear of the water is worth a hold or more), and the boss slain is worth a bonus.
 */
export const TREASURE_PER_PLUNDER = 5;
export const HUNT_BOSS_BONUS = 3;

/** The Kraken's hull in the hunt of an area: its own 15 in the first hunt, 3 more each later area. */
export function huntBossHull(areaIndex: number): number {
  return 15 + 3 * Math.max(0, areaIndex - 1);
}

/** The monsters of an area's hunt, the boss first: more of them in the later seas. */
export function huntMonsters(areaIndex: number): readonly ('giant-squid' | 'squid' | 'shark')[] {
  return [
    'giant-squid',
    'squid',
    'shark',
    ...(areaIndex >= 2 ? (['shark'] as const) : []),
    ...(areaIndex >= 3 ? (['squid'] as const) : []),
  ];
}

/**
 * The boss flagship is a Galleon grown past its class: more hull and cannons in
 * each later area. Starting guesses (a Galleon is 6 hull and 3 cannons a side;
 * a fully upgraded hero has 10 hull and 3 cannons).
 */
export function bossLoadout(areaIndex: number): { maxHull: number; cannonsPerSide: number } {
  return { maxHull: 6 + 2 * areaIndex, cannonsPerSide: areaIndex >= 3 ? 4 : 3 };
}
