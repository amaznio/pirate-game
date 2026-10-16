/**
 * Which art the match is drawn with. Scallywag (pixel art, see docs/ROADMAP.md,
 * phase 3) is the default; the older Kenney art is chosen with `?art=kenney`.
 */
export type ArtStyle = 'kenney' | 'scallywag';

export function artStyleFromSearch(search: string): ArtStyle {
  return new URLSearchParams(search).get('art') === 'kenney' ? 'kenney' : 'scallywag';
}

/**
 * Which ships the pixel-art match shows: the living Scallywag fleet (default) or
 * the regal Atlantean one (`?ships=atlantean`), a sheet of the same layout drawn
 * by tools/art/atlantean_ships.py. It also has a cannon in each team's colour.
 */
export type ShipSet = 'living' | 'atlantean';

export function shipSetFromSearch(search: string): ShipSet {
  return new URLSearchParams(search).get('ships') === 'atlantean' ? 'atlantean' : 'living';
}

let cachedShipSet: ShipSet | null = null;

export function currentShipSet(): ShipSet {
  if (cachedShipSet === null) {
    cachedShipSet = shipSetFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  }
  return cachedShipSet;
}

/**
 * The sea in the pixel-art style: `calm` is a soft blue drawn in code, `pack`
 * the Scallywag pack's own (much brighter, busier) water tiles.
 */
export type WaterStyle = 'calm' | 'pack';

export function waterStyleFromSearch(search: string): WaterStyle {
  return new URLSearchParams(search).get('water') === 'pack' ? 'pack' : 'calm';
}

/**
 * How the calm sea is made: `ripples` is a scatter of small marks that grow and
 * fade in place over a slowly drifting soft swell, `lines` the earlier long
 * lines of swell and chop (kept to compare).
 */
export type SeaMode = 'ripples' | 'lines';

export function seaModeFromSearch(search: string): SeaMode {
  return new URLSearchParams(search).get('sea') === 'lines' ? 'lines' : 'ripples';
}

export function currentSeaMode(): SeaMode {
  return seaModeFromSearch(typeof window === 'undefined' ? '' : window.location.search);
}

/**
 * Whether the drifting stripes of swell are drawn over the water in `ripples`
 * mode. Off for now (`?bands=on` brings them back), to see the sea without them.
 */
export function swellBandsFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('bands') === 'on';
}

export function currentSwellBands(): boolean {
  return swellBandsFromSearch(typeof window === 'undefined' ? '' : window.location.search);
}

export function currentWaterStyle(): WaterStyle {
  return waterStyleFromSearch(typeof window === 'undefined' ? '' : window.location.search);
}

/** The art for this page, read once from its URL. */
let cached: ArtStyle | null = null;

export function currentArtStyle(): ArtStyle {
  if (cached === null) {
    cached = artStyleFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  }
  return cached;
}
