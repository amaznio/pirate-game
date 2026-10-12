import { describe, expect, it } from 'vitest';
import {
  artStyleFromSearch,
  seaModeFromSearch,
  swellBandsFromSearch,
  waterStyleFromSearch,
} from '../artStyle';

describe('artStyleFromSearch', () => {
  it('keeps the Kenney art unless Scallywag is asked for', () => {
    expect(artStyleFromSearch('')).toBe('kenney');
    expect(artStyleFromSearch('?ais=3')).toBe('kenney');
    expect(artStyleFromSearch('?art=kenney')).toBe('kenney');
    expect(artStyleFromSearch('?art=something')).toBe('kenney');
  });

  it('switches to the Scallywag art with ?art=scallywag', () => {
    expect(artStyleFromSearch('?art=scallywag')).toBe('scallywag');
    expect(artStyleFromSearch('?ais=2&art=scallywag&seed=3')).toBe('scallywag');
  });
});

describe('waterStyleFromSearch', () => {
  it("is the calm sea unless the pack's own water is asked for", () => {
    expect(waterStyleFromSearch('')).toBe('calm');
    expect(waterStyleFromSearch('?art=scallywag')).toBe('calm');
    expect(waterStyleFromSearch('?water=whatever')).toBe('calm');
    expect(waterStyleFromSearch('?art=scallywag&water=pack')).toBe('pack');
  });
});

describe('seaModeFromSearch', () => {
  it('is ripples unless the older lines are asked for', () => {
    expect(seaModeFromSearch('')).toBe('ripples');
    expect(seaModeFromSearch('?sea=whatever')).toBe('ripples');
    expect(seaModeFromSearch('?art=scallywag&sea=lines')).toBe('lines');
  });
});

describe('swellBandsFromSearch', () => {
  it('is off unless asked for', () => {
    expect(swellBandsFromSearch('')).toBe(false);
    expect(swellBandsFromSearch('?bands=off')).toBe(false);
    expect(swellBandsFromSearch('?art=scallywag&bands=on')).toBe(true);
  });
});
