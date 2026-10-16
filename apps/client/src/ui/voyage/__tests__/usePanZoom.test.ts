import { describe, expect, it } from 'vitest';
import { clampView, viewCentredOn, zoomAround, type MapBounds } from '../usePanZoom';

const BOUNDS: MapBounds = { viewW: 400, viewH: 500, worldW: 480, worldH: 2000, minZoom: 0.6, maxZoom: 1.8, slack: 80 };

describe('clampView', () => {
  it('keeps the zoom within its limits', () => {
    expect(clampView({ x: 0, y: 0, z: 5 }, BOUNDS).z).toBe(1.8);
    expect(clampView({ x: 0, y: 0, z: 0.1 }, BOUNDS).z).toBe(0.6);
  });

  it('never lets the world be dragged further than the slack past its edge', () => {
    const far = clampView({ x: 9999, y: 9999, z: 1 }, BOUNDS);
    expect(far.x).toBe(80);
    expect(far.y).toBe(80);
    const past = clampView({ x: -9999, y: -9999, z: 1 }, BOUNDS);
    expect(past.x).toBe(400 - 480 - 80);
    expect(past.y).toBe(500 - 2000 - 80);
  });

  it('keeps a world smaller than the viewport centred', () => {
    const small: MapBounds = { ...BOUNDS, viewW: 1000, worldW: 480, slack: 20 };
    expect(clampView({ x: 5, y: 0, z: 1 }, small).x).toBe((1000 - 480) / 2);
  });
});

describe('zoomAround', () => {
  it('keeps the world point under the pointer where it is', () => {
    const before = { x: -100, y: -300, z: 1 };
    const px = 200;
    const py = 250;
    const worldX = (px - before.x) / before.z;
    const worldY = (py - before.y) / before.z;
    const after = zoomAround(before, 1.5, px, py, BOUNDS);
    expect(after.z).toBeCloseTo(1.5);
    expect((px - after.x) / after.z).toBeCloseTo(worldX);
    expect((py - after.y) / after.z).toBeCloseTo(worldY);
  });

  it('stops at the zoom limits', () => {
    expect(zoomAround({ x: 0, y: 0, z: 1.7 }, 10, 100, 100, BOUNDS).z).toBe(1.8);
    expect(zoomAround({ x: 0, y: 0, z: 0.7 }, 0.01, 100, 100, BOUNDS).z).toBe(0.6);
  });
});

describe('viewCentredOn', () => {
  it('puts a world point at the chosen place in the viewport', () => {
    const view = viewCentredOn(240, 800, 1, 0.5, 0.4, BOUNDS);
    expect(view.x + 240 * view.z).toBeCloseTo(400 * 0.5);
    expect(view.y + 800 * view.z).toBeCloseTo(500 * 0.4);
  });

  it('cannot go past the top of the map for a stop near it', () => {
    const view = viewCentredOn(240, 10, 1, 0.5, 0.4, BOUNDS);
    expect(view.y).toBe(80);
  });
});
