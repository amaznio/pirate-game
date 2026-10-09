import {
  createDuelConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '@pirate/game-core/config/matchConfig';
import {
  AI_DIFFICULTIES,
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
} from '@pirate/game-core/domain/GameState';

const MAX_SHIPS = 16;

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
 *   ?humans=2&ais=2        extra humans are placeholders until multiplayer
 */
export function matchConfigFromSearch(search: string): MatchConfig {
  const params = new URLSearchParams(search);
  const ais = intParam(params, 'ais');
  const humans = intParam(params, 'humans');
  const aiDifficulty: AiDifficulty =
    AI_DIFFICULTIES.find((level) => level === params.get('difficulty')) ??
    DEFAULT_AI_DIFFICULTY;
  if (ais === null && humans === null) {
    return createDuelConfig({ aiDifficulty });
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
    });
  } catch {
    // e.g. a board too small for that many ships: fall back to the duel.
    return createDuelConfig({ aiDifficulty });
  }
}
