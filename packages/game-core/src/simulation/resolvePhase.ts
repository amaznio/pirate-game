import type { GameEvent } from '../domain/GameEvent';
import type { SubmittedActions, PhaseResult } from '../domain/TurnResult';
import type { MutableGameState } from './internal';
import { applyMovementPhase, type MovementIntent } from './movement';
import { resolveFirePhase, type FirePlan } from './combat';

/**
 * Resolves a single phase for every ship at once: all movement first, then all
 * cannon fire, then (inside the fire step) all damage. No ship has priority
 * over another; nothing depends on the order players are listed in. All events
 * are grouped in one PhaseResult so a later layer can animate them together.
 */
export function resolvePhase(
  state: MutableGameState,
  submitted: SubmittedActions,
  phase: number,
): PhaseResult {
  const events: GameEvent[] = [{ type: 'PHASE_STARTED', phase }];

  if (state.outcome === null) {
    const participants = Object.values(state.players)
      .map((player) => ({
        player,
        ship: state.ships[player.shipId],
        plan: submitted[player.id],
      }))
      .filter(({ ship }) => ship && ship.hp > 0);

    const intents: MovementIntent[] = [];
    for (const { ship, plan } of participants) {
      const action = plan?.movement[phase];
      if (action) {
        intents.push({ shipId: ship.id, action });
      }
    }
    events.push(...applyMovementPhase(state, intents, phase));

    const firePlans: FirePlan[] = [];
    for (const { ship, plan } of participants) {
      const slot = plan?.cannons[phase];
      if (slot) {
        firePlans.push({ ship: state.ships[ship.id], slot });
      }
    }
    events.push(...resolveFirePhase(state, firePlans, phase));
  }

  events.push({ type: 'PHASE_ENDED', phase });
  return { index: phase, events };
}
