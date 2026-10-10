import type { Board, Obstacle } from './Board';
import type { Ship } from './Ship';
import type { EntityId, PlayerId, TeamId } from './Entity';
import type {
  ActionQueue,
  CannonQueue,
  MovementAction,
  TokenInventory,
} from './Action';
import type { MatchRules } from './Rules';
import type { TerrainMap } from './Terrain';

export type ControllerKind = 'human' | 'ai';

/** How well an AI plays. */
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export const AI_DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal';

/**
 * Everything one participant owns: their resources and their plan for the
 * current turn. Keyed by PlayerId in GameState, so a match can have any number
 * of players.
 */
export interface PlayerState {
  readonly id: PlayerId;
  /** Name shown to everyone (avatar, fleet list). */
  readonly name: string;
  readonly teamId: TeamId;
  /** The single ship this player commands. */
  readonly shipId: EntityId;
  readonly controller: ControllerKind;
  /**
   * How well this ship is sailed whenever an AI is in command: a computer
   * opponent always, a human only while they are away.
   */
  readonly aiDifficulty: AiDifficulty;
  readonly tokens: TokenInventory;
  /** Cannonballs in the shared pool (used by either broadside). */
  readonly ammo: number;
  /** Movement queue (phase-aligned, null = idle). */
  readonly queue: ActionQueue;
  /** Cannon queue; each slot fires left, right, or both. */
  readonly cannonQueue: CannonQueue;
  readonly tokenGeneration: TokenGenerationConfig;
  /** The player has finalised their plan for this turn and can no longer edit it. */
  readonly lockedIn: boolean;
}

/** How a finished match ended. */
export type Outcome =
  | { readonly kind: 'win'; readonly teamId: TeamId }
  | { readonly kind: 'draw' };

/**
 * The authoritative game state. Everything both React and Phaser render is
 * derived from this object. It contains no references to frameworks, sprites
 * or DOM nodes.
 */
export interface GameState {
  readonly seed: number;
  readonly turn: number;
  readonly status: GameStatus;
  readonly board: Board;
  readonly rules: MatchRules;
  readonly ships: Readonly<Record<EntityId, Ship>>;
  readonly obstacles: Readonly<Record<EntityId, Obstacle>>;
  /** Wind and whirlpool cells, which carry the ships that end a phase on them. */
  readonly terrain: TerrainMap;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly outcome: Outcome | null;
}

export type GameStatus = 'planning' | 'resolving' | 'animating' | 'game_over';

/**
 * Placeholder for future crew/sailing-driven token generation. For now the
 * selection is deterministic and driven by either an "auto" rotation or the
 * player's requested token. Each player has their own.
 */
export interface TokenGenerationConfig {
  readonly auto: boolean;
  readonly requested: MovementAction;
  readonly rotationIndex: number;
}
