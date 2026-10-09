import type { GameState } from '../domain/GameState';
import type { SideActions } from '../domain/TurnResult';

/**
 * The opponent's decision maker. It only ever returns the same phase-aligned
 * plan format the player uses and never touches presentation or privileged
 * state.
 */
export interface AIController {
  chooseActions(state: GameState): SideActions;
}
