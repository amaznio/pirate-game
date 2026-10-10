import type { GameState, PlayerState } from '../domain/GameState';
import type { Board, Obstacle } from '../domain/Board';
import type { Ship } from '../domain/Ship';
import type { EntityId, PlayerId } from '../domain/Entity';
import type { MatchRules } from '../domain/Rules';
import type { TerrainMap } from '../domain/Terrain';
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
  rules: MatchRules;
  ships: Record<EntityId, Ship>;
  obstacles: Record<EntityId, Obstacle>;
  terrain: TerrainMap;
  players: Record<PlayerId, PlayerState>;
  outcome: GameState['outcome'];
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

  const players: Record<PlayerId, PlayerState> = {};
  for (const id of Object.keys(state.players)) {
    const player = state.players[id];
    players[id] = { ...player, tokens: cloneInventory(player.tokens) };
  }

  return {
    seed: state.seed,
    turn: state.turn,
    status: state.status,
    board: state.board,
    rules: state.rules,
    ships,
    obstacles,
    terrain: state.terrain,
    players,
    outcome: state.outcome,
  };
}

/** Casts the internal mutable state back to the immutable public shape. */
export function freeze(state: MutableGameState): GameState {
  return state;
}
