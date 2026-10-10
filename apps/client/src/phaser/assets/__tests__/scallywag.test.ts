import { describe, expect, it } from 'vitest';
import { SHIP_TYPES } from '@pirate/game-core/config/shipTypes';
import {
  HULL_LAYOUT,
  SHIPS_SHEET_SIZE,
  cannonFrameName,
  hullFrameName,
  hullStateFor,
  shipFrameRects,
  type HullSize,
} from '../scallywag';
import { SHIP_LOOKS } from '../../views/scallywagShip';

describe('the Scallywag ship frames', () => {
  const rects = shipFrameRects();

  it('all lie inside the sheet', () => {
    for (const rect of rects) {
      expect(rect.x, rect.name).toBeGreaterThanOrEqual(0);
      expect(rect.y, rect.name).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w, rect.name).toBeLessThanOrEqual(SHIPS_SHEET_SIZE.width);
      expect(rect.y + rect.h, rect.name).toBeLessThanOrEqual(SHIPS_SHEET_SIZE.height);
    }
  });

  it('have a name each', () => {
    const names = rects.map((rect) => rect.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('give every hull size 5 colours and a grey wreck, in 3 states each', () => {
    for (const size of Object.keys(HULL_LAYOUT) as HullSize[]) {
      const count = rects.filter((rect) => rect.name.startsWith(`hull/${size}/`)).length;

      expect(count).toBe((5 + 1) * 3);
    }
  });

  it('keep the frames of one hull size from overlapping each other', () => {
    for (const size of Object.keys(HULL_LAYOUT) as HullSize[]) {
      const hulls = rects.filter((rect) => rect.name.startsWith(`hull/${size}/`));
      for (let i = 0; i < hulls.length; i += 1) {
        for (let j = i + 1; j < hulls.length; j += 1) {
          const a = hulls[i];
          const b = hulls[j];
          const overlap =
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

          expect(overlap, `${a.name} / ${b.name}`).toBe(false);
        }
      }
    }
  });
});

describe('ship looks', () => {
  it('cover every ship class, and grow from small to large', () => {
    expect(Object.keys(SHIP_LOOKS).sort()).toEqual(Object.keys(SHIP_TYPES).sort());
    expect(SHIP_LOOKS.sloop.size).toBe('small');
    expect(SHIP_LOOKS.brigantine.size).toBe('medium');
    expect(SHIP_LOOKS.galleon.size).toBe('large');
  });

  it('use only frames that exist', () => {
    const names = new Set(shipFrameRects().map((rect) => rect.name));
    for (const look of Object.values(SHIP_LOOKS)) {
      expect(names.has(hullFrameName(look.size, 0, 'intact'))).toBe(true);
      expect(names.has(cannonFrameName(look.cannonType))).toBe(true);
    }
  });
});

describe('the hull picture for hull points', () => {
  it('stays whole while more than half the hull remains', () => {
    expect([4, 3].map((hp) => hullStateFor(hp, 4))).toEqual(['intact', 'intact']);
    expect([5, 4, 3].map((hp) => hullStateFor(hp, 5))).toEqual(['intact', 'intact', 'intact']);
  });

  it('cracks at half or less, and breaks at zero', () => {
    expect([2, 1].map((hp) => hullStateFor(hp, 4))).toEqual(['damaged', 'damaged']);
    expect(hullStateFor(3, 6)).toBe('damaged');
    expect(hullStateFor(0, 4)).toBe('split');
    expect(hullStateFor(-1, 4)).toBe('split');
  });

  it('shows damage on every class before the last hull point', () => {
    for (const maxHp of [4, 5, 6]) {
      expect(hullStateFor(1, maxHp)).toBe('damaged');
    }
  });
});
