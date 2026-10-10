import { describe, expect, it } from 'vitest';
import { artStyleFromSearch } from '../artStyle';

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
