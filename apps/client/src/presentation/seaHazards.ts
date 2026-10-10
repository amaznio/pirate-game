import type { TerrainMap } from '@pirate/game-core/domain/Terrain';

/** Which kinds of wind and whirlpool a board has (so the legend only explains those). */
export interface SeaHazards {
  readonly wind: boolean;
  readonly whirlpool: boolean;
}

export const NO_HAZARDS: SeaHazards = { wind: false, whirlpool: false };

export function seaHazards(terrain: TerrainMap): SeaHazards {
  let wind = false;
  let whirlpool = false;
  for (const cell of Object.values(terrain)) {
    if (cell.kind === 'wind') {
      wind = true;
    } else {
      whirlpool = true;
    }
    if (wind && whirlpool) {
      break;
    }
  }
  return { wind, whirlpool };
}
