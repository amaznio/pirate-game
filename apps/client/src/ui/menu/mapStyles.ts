import type { MapStyle } from '@pirate/game-core/board/generateBoard';

/** How each kind of sea is named and described in the menus. */
export const MAP_STYLE_CHOICES: ReadonlyArray<{
  readonly value: MapStyle;
  readonly label: string;
  readonly blurb: string;
}> = [
  {
    value: 'calm',
    label: 'Calm',
    blurb: 'A few rocks and hardly any wind. Mostly open water.',
  },
  {
    value: 'normal',
    label: 'Normal',
    blurb: 'Reefs, some wind lanes and the odd whirlpool.',
  },
  {
    value: 'stormy',
    label: 'Stormy',
    blurb: 'Crowded with reefs, gales and whirlpools. Every board is new.',
  },
];

export function mapStyleBlurb(style: MapStyle): string {
  return MAP_STYLE_CHOICES.find((choice) => choice.value === style)?.blurb ?? '';
}
