import { describe, expect, it } from 'vitest';
import { SHIP_TYPES } from '@pirate/game-core/config/shipTypes';
import {
  HULL_LAYOUT,
  SHIPS_SHEET_SIZE,
  FX_FRAMES,
  STONE_COUNT,
  WAKE_FRAMES,
  WATER_SHEET_SIZE,
  cannonFrameName,
  hullFrameName,
  packFrames,
  hullStateFor,
  shipFrameRects,
  stoneScale,
  stoneSize,
  waterFrameRects,
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

describe('the padded ship sheet', () => {
  const packed = packFrames(shipFrameRects(), 1024, 2);

  it('keeps every frame, at its own size', () => {
    const source = shipFrameRects();
    expect(packed.frames).toHaveLength(source.length);
    packed.frames.forEach((frame, index) => {
      expect(frame.name).toBe(source[index].name);
      expect(frame.w).toBe(source[index].w);
      expect(frame.h).toBe(source[index].h);
    });
  });

  it('keeps every frame inside the sheet with two clear pixels all round', () => {
    expect(packed.width).toBeLessThanOrEqual(1024);
    for (const frame of packed.frames) {
      expect(frame.sheetX, frame.name).toBeGreaterThanOrEqual(2);
      expect(frame.sheetY, frame.name).toBeGreaterThanOrEqual(2);
      expect(frame.sheetX + frame.w + 2, frame.name).toBeLessThanOrEqual(packed.width);
      expect(frame.sheetY + frame.h + 2, frame.name).toBeLessThanOrEqual(packed.height);
    }
  });

  it('never lets two frames, with their margins, touch', () => {
    for (let i = 0; i < packed.frames.length; i += 1) {
      for (let j = i + 1; j < packed.frames.length; j += 1) {
        const a = packed.frames[i];
        const b = packed.frames[j];
        const apart =
          a.sheetX + a.w + 2 <= b.sheetX - 2 ||
          b.sheetX + b.w + 2 <= a.sheetX - 2 ||
          a.sheetY + a.h + 2 <= b.sheetY - 2 ||
          b.sheetY + b.h + 2 <= a.sheetY - 2;

        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
  });
});

describe('the Scallywag effects', () => {
  const rects = shipFrameRects();

  it('have four smoke puffs, four explosions and six wake frames, all on the sheet', () => {
    expect(rects.filter((rect) => rect.name.startsWith('fx/puff/'))).toHaveLength(FX_FRAMES);
    expect(rects.filter((rect) => rect.name.startsWith('fx/explosion/'))).toHaveLength(FX_FRAMES);
    expect(rects.filter((rect) => rect.name.startsWith('wake/'))).toHaveLength(WAKE_FRAMES);
    for (const rect of rects.filter((r) => /^(fx|wake)\//.test(r.name))) {
      expect(rect.x + rect.w, rect.name).toBeLessThanOrEqual(SHIPS_SHEET_SIZE.width);
      expect(rect.y + rect.h, rect.name).toBeLessThanOrEqual(SHIPS_SHEET_SIZE.height);
    }
  });

  it('do not overlap one another', () => {
    const effects = rects.filter((r) => /^(fx|wake)\//.test(r.name));
    for (let i = 0; i < effects.length; i += 1) {
      for (let j = i + 1; j < effects.length; j += 1) {
        const a = effects[i];
        const b = effects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  });
});

describe('the Scallywag stones', () => {
  const rects = waterFrameRects();

  it('are twelve, inside the water sheet, each with its own name', () => {
    expect(rects).toHaveLength(STONE_COUNT);
    expect(STONE_COUNT).toBe(12);
    expect(new Set(rects.map((rect) => rect.name)).size).toBe(rects.length);
    for (const rect of rects) {
      expect(rect.x, rect.name).toBeGreaterThanOrEqual(0);
      expect(rect.y, rect.name).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w, rect.name).toBeLessThanOrEqual(WATER_SHEET_SIZE.width);
      expect(rect.y + rect.h, rect.name).toBeLessThanOrEqual(WATER_SHEET_SIZE.height);
    }
  });

  it('do not overlap each other', () => {
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  });

  it('are drawn at a whole-number scale and stay smaller than a ship', () => {
    // A sloop is 30 px wide and 64 long on the board.
    for (let index = 0; index < STONE_COUNT; index += 1) {
      const scale = stoneScale(index);
      const drawn = stoneSize(index).w * scale;

      expect(Number.isInteger(scale), `stone ${index}`).toBe(true);
      expect(drawn, `stone ${index}`).toBeGreaterThanOrEqual(16);
      expect(drawn, `stone ${index}`).toBeLessThanOrEqual(48);
      expect(stoneSize(index).h * scale, `stone ${index}`).toBeLessThan(64);
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
