import type { GameState, Outcome } from '../domain/GameState';
import type { GameEvent } from '../domain/GameEvent';
import type {
  SubmittedActions,
  TurnResult,
  PhaseResult,
} from '../domain/TurnResult';
import { ACTIONS_PER_TURN } from '../domain/Action';
import { toMutable, freeze } from './internal';
import { resolvePhase } from './resolvePhase';
import { getLivingShips } from './selectors';
import { evaluateObjective } from './objectives';

/**
 * The match is over when at most one team still has a ship afloat. One team
 * left is a win; none left (e.g. a simultaneous kill) is a draw. A match with an
 * objective is settled by that first (see `evaluateObjective`); `endOfTurn` is
 * true after the last phase of a turn.
 */
export function evaluateOutcome(state: GameState, endOfTurn = false): Outcome | null {
  const byObjective = evaluateObjective(state, endOfTurn);
  if (byObjective) {
    return byObjective;
  }
  const teams = new Set(getLivingShips(state).map((ship) => ship.teamId));
  if (teams.size === 0) {
    return { kind: 'draw' };
  }
  if (teams.size === 1) {
    return { kind: 'win', teamId: [...teams][0] };
  }
  return null;
}

/**
 * The single entry point for turn resolution. Pure and deterministic: given
 * the same state and submitted actions it always produces the same result.
 *
 * Returns the next state plus phase-grouped events. Animation sequencing is
 * deliberately not encoded here.
 */
export function resolveTurn(
  currentState: GameState,
  submitted: SubmittedActions,
): TurnResult {
  const state = toMutable(currentState);
  const phases: PhaseResult[] = [];
  const events: GameEvent[] = [{ type: 'TURN_STARTED', turn: state.turn }];

  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    const result = resolvePhase(state, submitted, phase);
    phases.push(result);
    events.push(...result.events);

    if (state.outcome === null) {
      const outcome = evaluateOutcome(state, phase === ACTIONS_PER_TURN - 1);
      if (outcome) {
        state.status = 'game_over';
        state.outcome = outcome;
        events.push({ type: 'GAME_ENDED', outcome });
      }
    }
  }

  // A ship that planned no move this turn earns its rest bonus next turn.
  for (const id of Object.keys(state.players)) {
    const movement = submitted[id]?.movement ?? [];
    state.players[id] = {
      ...state.players[id],
      restedLastTurn: movement.every((slot) => slot === null),
    };
  }

  events.push({ type: 'TURN_ENDED', turn: state.turn });
  return { nextState: freeze(state), phases, events };
}
