import { describe, expect, it } from 'vitest';
import { startRun } from '../engine';
import {
  CANNON_DAMAGE_CAP,
  CANNONS_PER_SIDE_CAP,
  CANNONBALLS_UPGRADE,
  HULL_LEVEL_CAP,
  RELOAD_BONUS_CAP,
  REPAIR_UPGRADE,
  maxHullFor,
} from '../rules';
import { OFFER_SIZE, applyUpgrade, canTake, offerUpgrades } from '../upgrades';
import { UPGRADE_IDS, type RunState } from '../types';

const base: RunState = { ...startRun(99), phase: 'map', offer: undefined };

describe('offerUpgrades', () => {
  it('offers three different upgrades the ship can use', () => {
    for (let node = 0; node < 40; node += 1) {
      const offer = offerUpgrades(base, `a0:${node}:0`);
      expect(offer).toHaveLength(OFFER_SIZE);
      expect(new Set(offer).size).toBe(offer.length);
      for (const id of offer) {
        expect(canTake(base, id)).toBe(true);
      }
    }
  });

  it('is the same at the same port and differs between ports and seeds', () => {
    expect(offerUpgrades(base, 'a0:3:0')).toEqual(offerUpgrades(base, 'a0:3:0'));
    const offers = new Set(Array.from({ length: 30 }, (_, i) => offerUpgrades(base, `a0:${i}:0`).join()));
    expect(offers.size).toBeGreaterThan(3);
    expect(offerUpgrades({ ...base, seed: 1 }, 'a0:3:0')).not.toEqual(offerUpgrades({ ...base, seed: 2 }, 'a0:3:0'));
  });

  it('leaves out upgrades that would do nothing', () => {
    const maxed: RunState = {
      ...base,
      hullLevel: HULL_LEVEL_CAP,
      hull: maxHullFor(HULL_LEVEL_CAP),
      cannonsPerSide: CANNONS_PER_SIDE_CAP,
      cannonDamage: CANNON_DAMAGE_CAP,
      reloadBonus: RELOAD_BONUS_CAP,
    };
    expect(canTake(maxed, 'reinforceHull')).toBe(false);
    expect(canTake(maxed, 'addCannon')).toBe(false);
    expect(canTake(maxed, 'cannonDamage')).toBe(false);
    expect(canTake(maxed, 'quickLoaders')).toBe(false);
    expect(canTake(maxed, 'repair')).toBe(false);
    expect(canTake(maxed, 'cannonballs')).toBe(true);
    expect(offerUpgrades(maxed, 'a4:7:0')).toEqual(['cannonballs']);
  });

  it('keeps the quick loaders out of the first area, offers them later, and stops at the cap', () => {
    const count = (areaIndex: number): number => {
      let seen = 0;
      for (let node = 0; node < 200; node += 1) {
        if (offerUpgrades({ ...base, areaIndex }, `a${areaIndex}:${node}:0`).includes('quickLoaders')) {
          seen += 1;
        }
      }
      return seen;
    };
    expect(count(0)).toBe(0);
    expect(count(1)).toBeGreaterThan(0);
    const once = applyUpgrade(base, 'quickLoaders').state;
    expect(once.reloadBonus).toBe(base.reloadBonus + 1);
    const twice = applyUpgrade(once, 'quickLoaders').state;
    expect(twice.reloadBonus).toBe(RELOAD_BONUS_CAP);
    expect(canTake(twice, 'quickLoaders')).toBe(false);
    expect(applyUpgrade(twice, 'quickLoaders').state.reloadBonus).toBe(RELOAD_BONUS_CAP);
  });

  it('keeps the damage upgrade out of the first area and offers it more often later', () => {
    const count = (areaIndex: number): number => {
      let seen = 0;
      for (let node = 0; node < 300; node += 1) {
        if (offerUpgrades({ ...base, areaIndex }, `a${areaIndex}:${node}:0`).includes('cannonDamage')) {
          seen += 1;
        }
      }
      return seen;
    };
    expect(count(0)).toBe(0);
    expect(count(1)).toBeGreaterThan(0);
    expect(count(4)).toBeGreaterThan(count(1));
  });

  it('always has something to offer', () => {
    for (const hullLevel of [0, 3, HULL_LEVEL_CAP]) {
      expect(offerUpgrades({ ...base, hullLevel }, 'a1:2:0').length).toBeGreaterThan(0);
    }
  });
});

describe('applyUpgrade', () => {
  it('each upgrade does its one job and stops at its cap', () => {
    let state = base;
    for (let i = 0; i < 10; i += 1) {
      state = applyUpgrade(state, 'addCannon').state;
    }
    expect(state.cannonsPerSide).toBe(CANNONS_PER_SIDE_CAP);

    state = base;
    for (let i = 0; i < 10; i += 1) {
      state = applyUpgrade(state, 'cannonDamage').state;
    }
    expect(state.cannonDamage).toBe(CANNON_DAMAGE_CAP);

    state = base;
    for (let i = 0; i < 20; i += 1) {
      state = applyUpgrade(state, 'reinforceHull').state;
    }
    expect(state.hullLevel).toBe(HULL_LEVEL_CAP);
    expect(state.hull).toBeLessThanOrEqual(maxHullFor(HULL_LEVEL_CAP));
  });

  it('cannonballs raise the stock for good and add some now', () => {
    const next = applyUpgrade(base, 'cannonballs').state;
    expect(next.ammo).toBe(base.ammo + CANNONBALLS_UPGRADE);
    expect(next.ammoBonus).toBe(base.ammoBonus + CANNONBALLS_UPGRADE);
  });

  it('repair never overfills', () => {
    const hurt = { ...base, hull: 1 };
    expect(applyUpgrade(hurt, 'repair').state.hull).toBe(1 + REPAIR_UPGRADE);
    expect(applyUpgrade(base, 'repair').state.hull).toBe(base.hull);
  });

  it('knows every upgrade', () => {
    for (const id of UPGRADE_IDS) {
      expect(() => applyUpgrade(base, id)).not.toThrow();
    }
  });
});
