import type { GameEvent } from './GameEvent';
import type { GameState } from './GameState';
import type { ActionQueue, CannonQueue } from './Action';
import type { Side } from './Entity';

/** Events for a single resolution phase so they can be animated together. */
export interface PhaseResult {
  readonly index: number;
  readonly events: GameEvent[];
}

/**
 * A side's phase-aligned plan for one turn. `movement[i]` and `cannons[i]`
 * apply to the same phase, so the two queues line up even though they are
 * independent.
 */
export interface SideActions {
  readonly movement: ActionQueue;
  readonly cannons: CannonQueue;
}

export type SubmittedActions = Record<Side, SideActions>;

/** The complete outcome of resolving one turn. */
export interface TurnResult {
  readonly nextState: GameState;
  readonly phases: PhaseResult[];
  readonly events: GameEvent[];
}
