import { createRng, pickWeighted } from '../rng';
import {
  CANNON_DAMAGE_CAP,
  CANNONBALLS_UPGRADE,
  CANNONS_PER_SIDE_CAP,
  HULL_LEVEL_CAP,
  PROVISIONS_UPGRADE,
  REPAIR_UPGRADE,
  cargoCapFor,
  classForHullLevel,
  maxHullFor,
} from './rules';
import type { RunState, UpgradeId } from './types';

/** How many upgrades a port puts on offer. */
export const OFFER_SIZE = 3;

/** How likely each upgrade is to be offered, when it can be taken. */
const WEIGHTS: Readonly<Record<UpgradeId, number>> = {
  reinforceHull: 3,
  addCannon: 2,
  cannonDamage: 2,
  cannonballs: 2,
  repair: 2,
  provisions: 2,
};

/** Whether this upgrade would do something for the ship as it is. */
export function canTake(state: RunState, upgrade: UpgradeId): boolean {
  switch (upgrade) {
    case 'reinforceHull':
      return state.hullLevel < HULL_LEVEL_CAP;
    case 'addCannon':
      return state.cannonsPerSide < CANNONS_PER_SIDE_CAP;
    case 'cannonDamage':
      return state.cannonDamage < CANNON_DAMAGE_CAP;
    case 'cannonballs':
      return true;
    case 'repair':
      return state.hull < maxHullFor(state.hullLevel);
    case 'provisions':
      return state.supplies < cargoCapFor(state.hullLevel);
  }
}

/**
 * The upgrades a port puts on offer: up to three different ones the ship can use,
 * drawn from the run seed and the port so the same port always offers the same.
 */
export function offerUpgrades(state: RunState, portNodeId: string): UpgradeId[] {
  const rng = createRng(state.seed, 'offer', portNodeId);
  let pool = (Object.keys(WEIGHTS) as UpgradeId[])
    .filter((upgrade) => canTake(state, upgrade))
    .map((upgrade) => ({ item: upgrade, weight: WEIGHTS[upgrade] }));
  const offer: UpgradeId[] = [];
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    const pick = pickWeighted(rng, pool);
    offer.push(pick);
    pool = pool.filter((entry) => entry.item !== pick);
  }
  return offer;
}

/** The ship after taking an upgrade, and the refit it caused (a new class), if any. */
export function applyUpgrade(
  state: RunState,
  upgrade: UpgradeId,
): { state: RunState; refit?: { from: string; to: string } } {
  switch (upgrade) {
    case 'reinforceHull': {
      const hullLevel = Math.min(HULL_LEVEL_CAP, state.hullLevel + 1);
      const from = classForHullLevel(state.hullLevel).id;
      const to = classForHullLevel(hullLevel).id;
      const next: RunState = {
        ...state,
        hullLevel,
        // One more hull in the frame, and the new plank is sound.
        hull: Math.min(maxHullFor(hullLevel), state.hull + 1),
      };
      return from === to ? { state: next } : { state: next, refit: { from, to } };
    }
    case 'addCannon':
      return { state: { ...state, cannonsPerSide: Math.min(CANNONS_PER_SIDE_CAP, state.cannonsPerSide + 1) } };
    case 'cannonDamage':
      return { state: { ...state, cannonDamage: Math.min(CANNON_DAMAGE_CAP, state.cannonDamage + 1) } };
    case 'cannonballs':
      return {
        state: {
          ...state,
          ammoBonus: state.ammoBonus + CANNONBALLS_UPGRADE,
          ammo: state.ammo + CANNONBALLS_UPGRADE,
        },
      };
    case 'repair':
      return {
        state: { ...state, hull: Math.min(maxHullFor(state.hullLevel), state.hull + REPAIR_UPGRADE) },
      };
    case 'provisions':
      return {
        state: {
          ...state,
          supplies: Math.min(cargoCapFor(state.hullLevel), state.supplies + PROVISIONS_UPGRADE),
        },
      };
  }
}
