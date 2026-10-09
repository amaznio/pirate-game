import type { GameState, TokenGenerationConfig } from '../domain/GameState';
import type { Board, Obstacle } from '../domain/Board';
import type { Ship } from '../domain/Ship';
import type { EntityId, Side } from '../domain/Entity';
import type { ActionQueue, CannonQueue, TokenInventory } from '../domain/Action';
import { cloneInventory } from '../domain/Action';

/**
 * Internal, mutable mirror of GameState. The public simulation boundary is
 * always immutable GameState; within a single resolveTurn call we work on a
 * private clone so the caller's state is never mutated.
 */
export interface MutableGameState {
  seed: number;
  turn: number;
  status: GameState['status'];
  board: Board;
  ships: Record<EntityId, Ship>;
  obstacles: Record<EntityId, Obstacle>;
  tokenInventories: Record<Side, TokenInventory>;
  queues: Record<Side, ActionQueue>;
  cannonQueues: Record<Side, CannonQueue>;
  ammo: Record<Side, number>;
  tokenGeneration: TokenGenerationConfig;
  winner: Side | null;
}

export function toMutable(state: GameState): MutableGameState {
  const ships: Record<EntityId, Ship> = {};
  for (const id of Object.keys(state.ships)) {
    const ship = state.ships[id];
    ships[id] = { ...ship, position: { ...ship.position } };
  }

  const obstacles: Record<EntityId, Obstacle> = {};
  for (const id of Object.keys(state.obstacles)) {
    const obstacle = state.obstacles[id];
    obstacles[id] = { ...obstacle, position: { ...obstacle.position } };
  }

  return {
    seed: state.seed,
    turn: state.turn,
    status: state.status,
    board: state.board,
    ships,
    obstacles,
    tokenInventories: {
      player: cloneInventory(state.tokenInventories.player),
      enemy: cloneInventory(state.tokenInventories.enemy),
    },
    queues: { player: state.queues.player, enemy: state.queues.enemy },
    cannonQueues: {
      player: state.cannonQueues.player,
      enemy: state.cannonQueues.enemy,
    },
    ammo: { player: state.ammo.player, enemy: state.ammo.enemy },
    tokenGeneration: state.tokenGeneration,
    winner: state.winner,
  };
}

/** Casts the internal mutable state back to the immutable public shape. */
export function freeze(state: MutableGameState): GameState {
  return state;
}
