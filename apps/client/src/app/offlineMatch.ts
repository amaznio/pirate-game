import { EventBus } from '@pirate/game-core/events/EventBus';
import { GameController } from '@pirate/game-core/controller/GameController';
import { GameClient } from '@pirate/game-core/client/GameClient';
import { LocalTransport } from '@pirate/game-core/client/LocalTransport';
import {
  createDuelConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '@pirate/game-core/config/matchConfig';
import {
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
} from '@pirate/game-core/domain/GameState';

/**
 * A match hosted in this page. The player still plays through a client over a
 * transport, exactly as online: only the other end is in the same page.
 */
export interface OfflineMatch {
  readonly client: GameClient;
  dispose(): void;
}

export function startOfflineMatch(config: MatchConfig): OfflineMatch {
  const bus = new EventBus();
  const host = new GameController(bus, { config });
  const viewerId = host.getFirstHumanId();
  if (!viewerId) {
    throw new Error('A match needs at least one human player to control');
  }
  const transport = new LocalTransport(host, bus, viewerId);
  return {
    client: new GameClient(transport),
    dispose: () => {
      transport.dispose();
      host.dispose();
    },
  };
}

/** The match for "play against N AI opponents": the classic duel for one. */
export function offlineConfig(
  opponents: number,
  name: string,
  aiDifficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): MatchConfig {
  const base =
    opponents <= 1
      ? createDuelConfig({ aiDifficulty })
      : createSkirmishConfig({ humans: 1, ais: opponents, teamMode: 'ffa', aiDifficulty });
  const trimmed = name.trim();
  if (!trimmed) {
    return base;
  }
  return {
    ...base,
    participants: base.participants.map((participant, index) =>
      index === 0 ? { ...participant, name: trimmed } : participant,
    ),
  };
}
