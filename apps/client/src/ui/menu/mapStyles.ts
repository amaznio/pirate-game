import type { TFunction } from 'i18next';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';

/** The kinds of sea on offer. Names and blurbs live in the i18n catalogs. */
export const MAP_STYLE_CHOICES: readonly MapStyle[] = ['calm', 'normal', 'stormy'];

const KEYS = {
  calm: { label: 'sea.calm.label', blurb: 'sea.calm.blurb' },
  normal: { label: 'sea.normal.label', blurb: 'sea.normal.blurb' },
  stormy: { label: 'sea.stormy.label', blurb: 'sea.stormy.blurb' },
} as const satisfies Record<MapStyle, { label: string; blurb: string }>;

export function mapStyleLabel(t: TFunction, style: MapStyle): string {
  return t(KEYS[style].label);
}

export function mapStyleBlurb(t: TFunction, style: MapStyle): string {
  return t(KEYS[style].blurb);
}
