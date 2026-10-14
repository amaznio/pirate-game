import { CANNON_STARTING_AMMO } from '@pirate/game-core/config/gameRules';
import { getShipType, type ShipType } from '@pirate/game-core/config/shipTypes';
import type { BattleKind } from '../graph/types';

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

/** The most extra damage a cannon can have from upgrades. */
export const CANNON_DAMAGE_CAP = 3;

/** Cannonballs the Sloop starts with, and what "restock" fills back up to (plus upgrades). */
export const START_AMMO = getShipType(START_SHIP_TYPE_ID).cannons?.ammo ?? CANNON_STARTING_AMMO;

/** Cannonballs the ship refills to at a port: the class's own stock plus upgrades. */
export function ammoFullFor(level: number, ammoBonus: number): number {
  return (classForHullLevel(level).cannons?.ammo ?? CANNON_STARTING_AMMO) + ammoBonus;
}

/** How much one "cannonballs" upgrade adds to the stock, for good and right now. */
export const CANNONBALLS_UPGRADE = 2;
/** What the repair upgrade mends, and the provisions upgrade adds. */
export const REPAIR_UPGRADE = 2;
export const PROVISIONS_UPGRADE = 4;

/** What a port does for the ship on arrival; a landfall (the start of an area) does more. */
export const PORT_REPAIR = 2;
export const LANDFALL_REPAIR = 4;
export const PORT_SUPPLIES = 3;
/** A landfall restocks the hold to the top. */
export const LANDFALL_FILLS_HOLD = true;

/** What a leg of the route costs the hull when the hold cannot pay for it. */
export const STARVATION_HULL_COST = 1;

/** Supplies a won battle pays; a merchant kill pays the most. */
export const BATTLE_REWARD: Readonly<Record<BattleKind | 'boss', number>> = {
  standard: 2,
  survive: 3,
  salvage: 3,
  merchant: 4,
  ambush: 4,
  boss: 4,
};

/** Supplies one leg of the route costs the ship at this hull level, before the leg's own cost. */
export function supplyUseFor(level: number): number {
  return classForHullLevel(level).supplyUse;
}

/** How many supplies the hold carries at this hull level. */
export function cargoCapFor(level: number): number {
  return classForHullLevel(level).cargoCap;
}
