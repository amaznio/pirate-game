import type { GameState } from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions } from '../domain/TurnResult';

/**
 * Decision maker for one AI-controlled player. It only ever returns the same
 * phase-aligned plan format a human uses and never touches presentation or
 * privileged state.
 */
export interface AIController {
  chooseActions(state: GameState, playerId: PlayerId): PlayerActions;
}
