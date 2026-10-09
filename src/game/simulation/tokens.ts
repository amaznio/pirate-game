import type {
  GameState,
  PlayerState,
  TokenGenerationConfig,
} from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { ActionQueue, MovementAction, TokenInventory } from '../domain/Action';
import { cloneInventory, emptyCannonQueue, emptyQueue } from '../domain/Action';
import {
  AUTO_TOKEN_ROTATION,
  CANNON_RELOAD_AMOUNT,
  CANNON_RELOAD_INTERVAL_TURNS,
  TOKENS_PER_TURN,
} from '../config/gameRules';

export interface TokenSelection {
  readonly token: MovementAction;
  readonly tokenGeneration: TokenGenerationConfig;
}

/**
 * Chooses the next movement token to produce. When AUTO is on it walks the
 * deterministic rotation; otherwise it uses the player's requested token.
 * Swap this out later for crew/sailing-driven generation.
 */
export function selectNextToken(
  generation: TokenGenerationConfig,
): TokenSelection {
  if (!generation.auto) {
    return { token: generation.requested, tokenGeneration: generation };
  }

  const index = generation.rotationIndex % AUTO_TOKEN_ROTATION.length;
  return {
    token: AUTO_TOKEN_ROTATION[index],
    tokenGeneration: {
      ...generation,
      rotationIndex: generation.rotationIndex + 1,
    },
  };
}

/**
 * Deducts the movement tokens a plan consumes. Never goes negative, so an
 * over-budget plan simply costs what the pool can cover. Used for AI players,
 * who spend their pool when a plan is locked in.
 */
export function spendMovementTokens(
  inventory: TokenInventory,
  movement: ActionQueue,
): TokenInventory {
  const next = cloneInventory(inventory);
  for (const action of movement) {
    if (action && next[action] > 0) {
      next[action] -= 1;
    }
  }
  return next;
}

/**
 * Cannonballs reload slower than movement tokens: a fixed amount is added every
 * N completed turns. There is no upper cap, so the pool keeps growing until it
 * is spent. Kept behind a function so the reload curve can be replaced later
 * without touching other layers.
 */
export function reloadedAmmo(current: number, completedTurn: number): number {
  if (completedTurn % CANNON_RELOAD_INTERVAL_TURNS !== 0) {
    return current;
  }
  return current + CANNON_RELOAD_AMOUNT;
}

export interface NextTurnResult {
  readonly state: GameState;
  /** The movement token each player produced for the new turn. */
  readonly tokens: Readonly<Record<PlayerId, MovementAction>>;
}

/**
 * Advances to the next turn: increments the turn counter, clears every player's
 * move and cannon queues, reloads cannonballs, and produces one movement token
 * for each player from their own token-generation settings.
 */
export function beginNextTurn(state: GameState): NextTurnResult {
  const players: Record<PlayerId, PlayerState> = {};
  const produced: Record<PlayerId, MovementAction> = {};

  for (const id of Object.keys(state.players)) {
    const player = state.players[id];
    const selection = selectNextToken(player.tokenGeneration);
    const tokens = cloneInventory(player.tokens);
    tokens[selection.token] += TOKENS_PER_TURN;
    produced[id] = selection.token;

    players[id] = {
      ...player,
      tokens,
      ammo: reloadedAmmo(player.ammo, state.turn),
      queue: emptyQueue(),
      cannonQueue: emptyCannonQueue(),
      tokenGeneration: selection.tokenGeneration,
    };
  }

  return {
    tokens: produced,
    state: {
      ...state,
      turn: state.turn + 1,
      status: 'planning',
      players,
    },
  };
}
