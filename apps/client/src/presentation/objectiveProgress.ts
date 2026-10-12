import type { GameView } from '@pirate/game-core/view/GameView';
import type { OutcomeReason } from '@pirate/game-core/domain/Objective';

/** How the match's objective stands, from the viewing player's side. */
export type ObjectiveProgress =
  | { readonly kind: 'survive'; readonly turn: number; readonly turns: number }
  | {
      readonly kind: 'salvage';
      /** Pickups taken by the viewer's team. */
      readonly yours: number;
      /** Pickups taken by the best other team. */
      readonly rival: number;
      readonly target: number;
    };

/** The objective's progress, or null when the match has none. */
export function objectiveProgress(view: GameView): ObjectiveProgress | null {
  const objective = view.objective;
  if (!objective) {
    return null;
  }
  if (objective.kind === 'survive') {
    return { kind: 'survive', turn: Math.min(view.turn, objective.turns), turns: objective.turns };
  }

  const byTeam = new Map<string, number>();
  for (const player of Object.values(view.players)) {
    const tally = view.pickupsTaken?.[player.id];
    const taken = tally ? tally.barrel + tally.crate + tally.plank : 0;
    byTeam.set(player.teamId, (byTeam.get(player.teamId) ?? 0) + taken);
  }
  const mine = view.self.teamId;
  const rival = Math.max(0, ...[...byTeam.entries()].filter(([team]) => team !== mine).map(([, n]) => n));
  return { kind: 'salvage', yours: byTeam.get(mine) ?? 0, rival, target: objective.target };
}

/** Which text to show under the title of a finished match. */
export type EndNote =
  | 'survived'
  | 'objectiveFailed'
  | 'salvageWon'
  | 'salvageLost'
  | 'salvageDraw'
  | null;

export function endNote(
  view: GameView,
  result: 'win' | 'loss' | 'draw' | null,
  reason: OutcomeReason | undefined,
): EndNote {
  if (result === null || !view.objective) {
    return null;
  }
  if (view.objective.kind === 'salvage') {
    if (reason !== 'salvaged' && result !== 'draw') {
      return null;
    }
    return result === 'win' ? 'salvageWon' : result === 'loss' ? 'salvageLost' : 'salvageDraw';
  }
  if (reason === 'survived' && result === 'win') {
    return 'survived';
  }
  if (reason === 'objective_failed' && result === 'loss') {
    return 'objectiveFailed';
  }
  return null;
}
