import type { Board, Obstacle } from './Board';
import type { Ship } from './Ship';
import type { EntityId, Side } from './Entity';
import type {
  ActionQueue,
  CannonQueue,
  MovementAction,
  TokenInventory,
} from './Action';

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
  readonly ships: Readonly<Record<EntityId, Ship>>;
  readonly obstacles: Readonly<Record<EntityId, Obstacle>>;
  readonly tokenInventories: Readonly<Record<Side, TokenInventory>>;
  /** Movement queue per side (phase-aligned, null = idle). */
  readonly queues: Readonly<Record<Side, ActionQueue>>;
  /** Cannon queue per side; each slot fires left, right, or both. */
  readonly cannonQueues: Readonly<Record<Side, CannonQueue>>;
  /** Single shared cannonball pool per side (used by either broadside). */
  readonly ammo: Readonly<Record<Side, number>>;
  readonly tokenGeneration: TokenGenerationConfig;
  readonly winner: Side | null;
}

export type GameStatus = 'planning' | 'resolving' | 'animating' | 'game_over';

/**
 * Placeholder for future crew/sailing-driven token generation. For now the
 * selection is deterministic and driven by either an "auto" rotation or the
 * player's requested token.
 */
export interface TokenGenerationConfig {
  readonly auto: boolean;
  readonly requested: MovementAction;
  readonly rotationIndex: number;
}
