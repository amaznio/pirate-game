import { EventBus } from '@pirate/game-core/events/EventBus';
import { GameController } from '@pirate/game-core/controller/GameController';
import { GameClient } from '@pirate/game-core/client/GameClient';
import { LocalTransport } from '@pirate/game-core/client/LocalTransport';
import {
  createDuelConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '@pirate/game-core/config/matchConfig';
import { DEFAULT_MAP_STYLE, type MapStyle } from '@pirate/game-core/board/generateBoard';
import { randomSeed } from '@pirate/game-core/config/seed';
import type { Objective } from '@pirate/game-core/domain/Objective';
import { DEFAULT_SHIP_TYPE_ID } from '@pirate/game-core/config/shipTypes';
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

/** The ship classes for an offline match; opponents sail yours unless told otherwise. */
export interface OfflineShips {
  readonly yours?: string;
  readonly theirs?: string;
}

/** The match for "play against N AI opponents": the classic duel for one. */
export function offlineConfig(
  opponents: number,
  name: string,
  aiDifficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
  mapStyle: MapStyle = DEFAULT_MAP_STYLE,
  seed: number = randomSeed(),
  ships: OfflineShips = {},
  loot = false,
  objective?: Objective,
): MatchConfig {
  const yours = ships.yours ?? DEFAULT_SHIP_TYPE_ID;
  const theirs = ships.theirs ?? yours;
  const shipTypeIds = [yours, ...Array.from({ length: Math.max(1, opponents) }, () => theirs)];
  const base =
    opponents <= 1
      ? createDuelConfig({ aiDifficulty, sea: mapStyle, seed, shipTypeIds, loot, objective })
      : createSkirmishConfig({
          humans: 1,
          ais: opponents,
          teamMode: 'ffa',
          aiDifficulty,
          sea: mapStyle,
          loot,
          objective,
          seed,
          shipTypeIds,
        });
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
