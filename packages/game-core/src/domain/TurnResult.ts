import type { GameEvent } from './GameEvent';
import type { GameState } from './GameState';
import type { ActionQueue, CannonQueue } from './Action';
import type { PlayerId } from './Entity';

/** Events for a single resolution phase so they can be animated together. */
export interface PhaseResult {
  readonly index: number;
  readonly events: GameEvent[];
}

/**
 * A player's phase-aligned plan for one turn. `movement[i]` and `cannons[i]`
 * apply to the same phase, so the two queues line up even though they are
 * independent.
 */
export interface PlayerActions {
  readonly movement: ActionQueue;
  readonly cannons: CannonQueue;
}

/** Plans by player. A player with no entry passes the turn. */
export type SubmittedActions = Readonly<Record<PlayerId, PlayerActions>>;

/** The complete outcome of resolving one turn. */
export interface TurnResult {
  readonly nextState: GameState;
  readonly phases: PhaseResult[];
  readonly events: GameEvent[];
}
