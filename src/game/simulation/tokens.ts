import type { GameState, TokenGenerationConfig } from '../domain/GameState';
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
 * The opponent produces tokens on a fixed rotation derived from the completed
 * turn, so it plays by the same movement economy as the player.
 */
export function selectEnemyToken(completedTurn: number): MovementAction {
  return AUTO_TOKEN_ROTATION[completedTurn % AUTO_TOKEN_ROTATION.length];
}

/**
 * Deducts the movement tokens a plan consumes. Never goes negative, so an
 * over-budget plan simply costs what the pool can cover. Used for the AI, which
 * spends its pool when a plan is locked in.
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
  readonly token: MovementAction;
}

/**
 * Advances to the next turn: increments the turn counter, clears both move and
 * cannon queues, reloads cannonballs, and produces one movement token for each
 * side.
 */
export function beginNextTurn(state: GameState): NextTurnResult {
  const selection = selectNextToken(state.tokenGeneration);
  const playerInventory = cloneInventory(state.tokenInventories.player);
  playerInventory[selection.token] += TOKENS_PER_TURN;

  const enemyInventory = cloneInventory(state.tokenInventories.enemy);
  enemyInventory[selectEnemyToken(state.turn)] += TOKENS_PER_TURN;

  return {
    token: selection.token,
    state: {
      ...state,
      turn: state.turn + 1,
      status: 'planning',
      winner: state.winner,
      queues: { player: emptyQueue(), enemy: emptyQueue() },
      cannonQueues: { player: emptyCannonQueue(), enemy: emptyCannonQueue() },
      ammo: {
        player: reloadedAmmo(state.ammo.player, state.turn),
        enemy: reloadedAmmo(state.ammo.enemy, state.turn),
      },
      tokenInventories: {
        player: playerInventory,
        enemy: enemyInventory,
      },
      tokenGeneration: selection.tokenGeneration,
    },
  };
}
