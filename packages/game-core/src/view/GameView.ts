import type { Board, Obstacle } from '../domain/Board';
import type { EntityId, PlayerId, TeamId } from '../domain/Entity';
import type {
  AiDifficulty,
  ControllerKind,
  GameStatus,
  Outcome,
  PlayerState,
} from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { MatchRules } from '../domain/Rules';
import type { TerrainMap } from '../domain/Terrain';

/** What every player may know about another player. */
export interface PublicPlayerView {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId;
  readonly shipId: EntityId;
  readonly controller: ControllerKind;
  /** How well the AI sails this ship, or null while a human is in command. */
  readonly aiDifficulty: AiDifficulty | null;
  readonly lockedIn: boolean;
  /**
   * How busy their plan looks, from 0 (nothing planned) to 1 (full). It says
   * nothing about WHAT is planned.
   */
  readonly activity: number;
}

/**
 * The game as one player is allowed to see it. Everything about the board is
 * public (ships, positions, hulls, obstacles); plans and resources are private,
 * so only `self` carries them. This is the only state a client ever receives.
 */
export interface GameView {
  readonly viewerId: PlayerId;
  readonly turn: number;
  readonly status: GameStatus;
  readonly board: Board;
  readonly rules: MatchRules;
  readonly ships: Readonly<Record<EntityId, Ship>>;
  readonly obstacles: Readonly<Record<EntityId, Obstacle>>;
  readonly terrain: TerrainMap;
  /** The viewer's own player state, including their private plan and resources. */
  readonly self: PlayerState;
  /** Every player (the viewer included), public information only. */
  readonly players: Readonly<Record<PlayerId, PublicPlayerView>>;
  readonly outcome: Outcome | null;
  /**
   * Seconds left in the planning window as the host sees it. Sent as a
   * duration, not a timestamp, so clock differences between machines do not
   * matter. `null` when there is no running timer.
   */
  readonly planningSecondsRemaining: number | null;
}
