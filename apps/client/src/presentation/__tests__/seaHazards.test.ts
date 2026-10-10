import { describe, expect, it } from 'vitest';
import { terrainFrom, whirlpoolCells, windLane } from '@pirate/game-core/domain/Terrain';
import { NO_HAZARDS, seaHazards } from '../seaHazards';

describe('seaHazards', () => {
  it('finds nothing on open water', () => {
    expect(seaHazards({})).toEqual(NO_HAZARDS);
  });

  it('finds wind and whirlpools separately', () => {
    expect(seaHazards(terrainFrom(windLane({ x: 1, y: 1 }, 'EAST', 3)))).toEqual({
      wind: true,
      whirlpool: false,
    });
    expect(seaHazards(terrainFrom(whirlpoolCells({ x: 4, y: 4 }, 'left')))).toEqual({
      wind: false,
      whirlpool: true,
    });
    expect(
      seaHazards(
        terrainFrom(windLane({ x: 1, y: 1 }, 'EAST', 2), whirlpoolCells({ x: 6, y: 6 }, 'right')),
      ),
    ).toEqual({ wind: true, whirlpool: true });
  });
});
