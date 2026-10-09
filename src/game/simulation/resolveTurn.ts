import type { GameState } from '../domain/GameState';
import type { EntityId, Side } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type {
  SubmittedActions,
  TurnResult,
  PhaseResult,
} from '../domain/TurnResult';
import { ACTIONS_PER_TURN } from '../domain/Action';
import { toMutable, freeze } from './internal';
import { resolvePhase } from './resolvePhase';
import { getShipBySide } from './selectors';

interface GameOverOutcome {
  readonly winner: Side;
  readonly winnerShipId: EntityId;
  readonly loserShipId: EntityId;
}

function evaluateGameOver(
  state: GameState,
): GameOverOutcome | null {
  const player = getShipBySide(state, 'player');
  const enemy = getShipBySide(state, 'enemy');
  if (!player || !enemy) {
    return null;
  }
  if (enemy.hp <= 0 && player.hp > 0) {
    return { winner: 'player', winnerShipId: player.id, loserShipId: enemy.id };
  }
  if (player.hp <= 0 && enemy.hp > 0) {
    return { winner: 'enemy', winnerShipId: enemy.id, loserShipId: player.id };
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

    if (state.status !== 'game_over') {
      const outcome = evaluateGameOver(state);
      if (outcome) {
        state.status = 'game_over';
        state.winner = outcome.winner;
        events.push({
          type: 'GAME_ENDED',
          winnerId: outcome.winnerShipId,
          loserId: outcome.loserShipId,
        });
      }
    }
  }

  events.push({ type: 'TURN_ENDED', turn: state.turn });
  return { nextState: freeze(state), phases, events };
}
