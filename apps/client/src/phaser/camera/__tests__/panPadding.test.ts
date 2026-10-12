import { describe, expect, it } from 'vitest';
import { panPadding } from '../panPadding';

describe('panPadding', () => {
  it('is half the visible size, so any point of the board can reach the middle', () => {
    expect(panPadding(2000, 128, 2560)).toBe(1000);
  });

  it('is never less than the small pad round the board', () => {
    expect(panPadding(100, 128, 2560)).toBe(128);
  });

  it('never goes beyond the sea that is drawn', () => {
    expect(panPadding(20000, 128, 2560)).toBe(2560);
  });

  it('lets a window wider than the board scroll sideways', () => {
    // A 1280 px board in a 1900 px window at zoom 1: the camera can sit anywhere
    // from the board's left edge at the middle to its right edge at the middle.
    const board = 1280;
    const visible = 1900;
    const pad = panPadding(visible, 128, 2560);
    const boundsWidth = board + pad * 2;

    expect(boundsWidth).toBeGreaterThan(visible);
  });
});
