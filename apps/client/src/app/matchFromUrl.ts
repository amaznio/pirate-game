import {
  createDuelConfig,
  createHuntConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '@pirate/game-core/config/matchConfig';
import { MAP_STYLES, type MapStyle } from '@pirate/game-core/board/generateBoard';
import { randomSeed } from '@pirate/game-core/config/seed';
import { DEFAULT_SHIP_TYPE_ID, isPlayableShipType } from '@pirate/game-core/config/shipTypes';
import {
  AI_DIFFICULTIES,
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
} from '@pirate/game-core/domain/GameState';

const MAX_SHIPS = 16;

/** A ship class named in the URL, or null if it is missing or not a real class. */
function shipParam(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name);
  return raw !== null && isPlayableShipType(raw) ? raw : null;
}

function intParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null) {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Picks the match from the page URL so scenarios can be tried without code
 * changes. No parameters gives the classic 1v1.
 *
 *   ?ais=3                 you vs 3 AIs, free-for-all
 *   ?ais=3&teams=teams     two teams (you and every second ship vs the rest)
 *   ?ais=5&w=30&h=30       bigger board
 *   ?ais=2&difficulty=hard how well the AIs play (easy, normal or hard)
 *   ?map=stormy            the sea: calm, normal, stormy, or open (empty water)
 *   ?seed=123              rebuild the same board again (otherwise a new one)
 *   ?loot=on               float barrels, crates and planks to pick up
 *   ?hunt=on               a hunt: sea monsters and a boss, no enemy ships (add &warn=on to see their strikes)
 *   ?ship=galleon          your ship class (sloop, brigantine or galleon)
 *   ?enemy=sloop           the class the other ships sail (yours unless given)
 *   ?humans=2&ais=2        extra humans are placeholders until multiplayer
 */
export function matchConfigFromSearch(search: string): MatchConfig {
  const params = new URLSearchParams(search);
  const ais = intParam(params, 'ais');
  const humans = intParam(params, 'humans');
  const aiDifficulty: AiDifficulty =
    AI_DIFFICULTIES.find((level) => level === params.get('difficulty')) ??
    DEFAULT_AI_DIFFICULTY;
  const requestedSea = params.get('map');
  const sea: MapStyle | 'open' | undefined =
    requestedSea === 'open'
      ? 'open'
      : MAP_STYLES.find((style) => style === requestedSea);
  const seed = intParam(params, 'seed') ?? randomSeed();
  const loot = params.get('loot') === 'on';
  const yours = shipParam(params, 'ship') ?? DEFAULT_SHIP_TYPE_ID;
  if (params.has('hunt')) {
    return createHuntConfig({ seed, sea, shipTypeId: yours, monsterWarnings: params.get('warn') === 'on' });
  }
  const theirs = shipParam(params, 'enemy') ?? yours;
  if (ais === null && humans === null) {
    return createDuelConfig({ aiDifficulty, sea, seed, shipTypeIds: [yours, theirs], loot });
  }

  const humanCount = Math.max(1, humans ?? 1);
  const aiCount = Math.min(
    Math.max(0, ais ?? 1),
    Math.max(0, MAX_SHIPS - humanCount),
  );
  const width = intParam(params, 'w') ?? undefined;
  const height = intParam(params, 'h') ?? undefined;

  try {
    return createSkirmishConfig({
      humans: humanCount,
      ais: aiCount,
      teamMode: params.get('teams') === 'teams' ? 'teams' : 'ffa',
      width,
      height,
      aiDifficulty,
      sea,
      loot,
      seed,
      shipTypeIds: [yours, ...Array.from({ length: humanCount + aiCount - 1 }, () => theirs)],
    });
  } catch {
    // e.g. a board too small for that many ships: fall back to the duel.
    return createDuelConfig({ aiDifficulty, sea, seed, shipTypeIds: [yours, theirs], loot });
  }
}
