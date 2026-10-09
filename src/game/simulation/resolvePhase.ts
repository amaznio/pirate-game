import type { Side } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { SubmittedActions, PhaseResult } from '../domain/TurnResult';
import type { MutableGameState } from './internal';
import { getShipBySide } from './selectors';
import { applyMovementAction } from './movement';
import { resolveCannonSlot } from './combat';

/** Actions are resolved in a fixed order so results stay deterministic. */
export const SIDE_ORDER: readonly Side[] = ['player', 'enemy'];

/**
 * Resolves a single phase. Each ship executes its movement action for this
 * phase, then its cannon move (which may fire one or both broadsides). All
 * events are grouped in one PhaseResult so a later layer can animate them
 * together.
 */
export function resolvePhase(
  state: MutableGameState,
  submitted: SubmittedActions,
  phase: number,
): PhaseResult {
  const events: GameEvent[] = [{ type: 'PHASE_STARTED', phase }];

  const gameOver = state.status === 'game_over';

  if (!gameOver) {
    for (const side of SIDE_ORDER) {
      const ship = getShipBySide(state, side);
      if (!ship || ship.hp <= 0) {
        continue;
      }

      const plan = submitted[side];
      const movementAction = plan.movement[phase];
      if (movementAction) {
        events.push(...applyMovementAction(state, ship, movementAction, phase));
      }

      const movedShip = state.ships[ship.id];
      const cannonSlot = plan.cannons[phase];
      if (cannonSlot) {
        events.push(...resolveCannonSlot(state, movedShip, cannonSlot, phase));
      }
    }
  }

  events.push({ type: 'PHASE_ENDED', phase });
  return { index: phase, events };
}
