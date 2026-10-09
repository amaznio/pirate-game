import type { MovementAction, TokenInventory } from '../domain/Action';

/** Logical board size. The camera only ever shows a portion of this. */
export const BOARD_WIDTH = 20;
export const BOARD_HEIGHT = 20;

/** Deterministic board layout for the vertical slice (no randomness). */
export const PLAYER_START = { x: 9, y: 14 };
export const ENEMY_START = { x: 9, y: 5 };
export const PLAYER_START_HEADING = 'NORTH' as const;
export const ENEMY_START_HEADING = 'SOUTH' as const;
export const PLAYER_SHIP_TYPE = 'sloop';
export const ENEMY_SHIP_TYPE = 'sloop';

export const OBSTACLE_LAYOUT: ReadonlyArray<{
  id: string;
  kind: 'rock' | 'island';
  x: number;
  y: number;
}> = [
  { id: 'rock-1', kind: 'rock', x: 7, y: 10 },
  { id: 'rock-2', kind: 'rock', x: 11, y: 10 },
  { id: 'rock-3', kind: 'rock', x: 8, y: 8 },
  { id: 'rock-4', kind: 'rock', x: 12, y: 8 },
  { id: 'rock-5', kind: 'rock', x: 6, y: 13 },
  { id: 'rock-6', kind: 'rock', x: 13, y: 13 },
  { id: 'island-1', kind: 'island', x: 2, y: 2 },
  { id: 'island-2', kind: 'island', x: 17, y: 2 },
  { id: 'island-3', kind: 'island', x: 2, y: 17 },
  { id: 'island-4', kind: 'island', x: 17, y: 17 },
];

/** Player starts with this many tokens of each type. */
export const INITIAL_TOKEN_POOL: TokenInventory = {
  FORWARD: 3,
  TURN_LEFT: 2,
  TURN_RIGHT: 1,
};

/** Number of tokens produced at the start of each new turn. */
export const TOKENS_PER_TURN = 1;

/**
 * Wall-clock seconds the player has to plan each turn. When it elapses the
 * turn is locked in automatically with whatever is queued (an empty queue is a
 * valid pass).
 */
export const TURN_DURATION_SECONDS = 30;

/**
 * Deterministic auto-generation order used when AUTO is enabled. Replace this
 * (and generateToken in simulation/tokens.ts) when crew performance should
 * drive token production.
 */
export const AUTO_TOKEN_ROTATION: readonly MovementAction[] = [
  'FORWARD',
  'TURN_LEFT',
  'FORWARD',
  'TURN_RIGHT',
];

/**
 * Cannonball / reload resource. One shared pool per side, spent one cannonball
 * per broadside fired (a "both sides" shot costs two). A fixed amount reloads
 * every completed turn (configurable via the interval), and there is no upper
 * cap: cannonballs accumulate until fired.
 *
 * These numbers are placeholders: tune them here (or replace the reload logic
 * in simulation/tokens.ts) without touching any other layer.
 */
export const CANNON_STARTING_AMMO = 3;
export const CANNON_RELOAD_AMOUNT = 1;
export const CANNON_RELOAD_INTERVAL_TURNS = 1;
