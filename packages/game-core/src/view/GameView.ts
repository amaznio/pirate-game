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
import type { PickupMap } from '../domain/Pickup';
import type { MonsterMap } from '../domain/Monster';
import type { MatchResult, PickupTally } from '../domain/MatchResult';
import type { Objective } from '../domain/Objective';
import type { SeaChoice } from '../board/generateBoard';

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
  /** The treasure they carry (a score, so public). Only in a hunt. */
  readonly haul?: number;
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
  /** Barrels, crates and planks afloat, taken by the ship that ends a phase on one. None when left out. */
  readonly pickups?: PickupMap;
  /** Creatures on the water and what they have marked to strike this turn (public). None when absent. */
  readonly monsters?: MonsterMap;
  /** What each player has picked up so far (public, it is a score). None when nobody has. */
  readonly pickupsTaken?: Readonly<Record<PlayerId, PickupTally>>;
  /** The match's objective, when it has one. */
  readonly objective?: Objective;
  /** The kind of sea chosen for the match, when one was; the water is drawn to suit. */
  readonly sea?: SeaChoice;
  /** The viewer's own player state, including their private plan and resources. */
  readonly self: PlayerState;
  /** Every player (the viewer included), public information only. */
  readonly players: Readonly<Record<PlayerId, PublicPlayerView>>;
  readonly outcome: Outcome | null;
  /** How the match went, for everyone to see. Present only once the match is over. */
  readonly result?: MatchResult;
  /**
   * Seconds left in the planning window as the host sees it. Sent as a
   * duration, not a timestamp, so clock differences between machines do not
   * matter. `null` when there is no running timer.
   */
  readonly planningSecondsRemaining: number | null;
}
