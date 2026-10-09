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

export type ControllerKind = 'human' | 'ai';

/**
 * Everything one participant owns: their resources and their plan for the
 * current turn. Keyed by PlayerId in GameState, so a match can have any number
 * of players.
 */
export interface PlayerState {
  readonly id: PlayerId;
  readonly teamId: TeamId;
  /** The single ship this player commands. */
  readonly shipId: EntityId;
  readonly controller: ControllerKind;
  readonly tokens: TokenInventory;
  /** Cannonballs in the shared pool (used by either broadside). */
  readonly ammo: number;
  /** Movement queue (phase-aligned, null = idle). */
  readonly queue: ActionQueue;
  /** Cannon queue; each slot fires left, right, or both. */
  readonly cannonQueue: CannonQueue;
  readonly tokenGeneration: TokenGenerationConfig;
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
