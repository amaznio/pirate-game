/**
 * Which art the match is drawn with. Kenney is the default; the Scallywag art
 * (see docs/ROADMAP.md, phase 3) is chosen with `?art=scallywag` until it
 * replaces it.
 */
export type ArtStyle = 'kenney' | 'scallywag';

export function artStyleFromSearch(search: string): ArtStyle {
  return new URLSearchParams(search).get('art') === 'scallywag' ? 'scallywag' : 'kenney';
}

/** The art for this page, read once from its URL. */
let cached: ArtStyle | null = null;

export function currentArtStyle(): ArtStyle {
  if (cached === null) {
    cached = artStyleFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  }
  return cached;
}
