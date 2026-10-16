import type { GameView } from '@pirate/game-core/view/GameView';
import type { OutcomeReason } from '@pirate/game-core/domain/Objective';
import type { Direction } from '@pirate/game-core/domain/Direction';

/** How the match's objective stands, from the viewing player's side. */
export type ObjectiveProgress =
  | { readonly kind: 'survive'; readonly turn: number; readonly turns: number }
  | {
      readonly kind: 'hunt';
      /** The treasure in the viewer's hold. */
      readonly haul: number;
    }
  | {
      readonly kind: 'salvage';
      /** Pickups taken by the viewer's team. */
      readonly yours: number;
      /** Pickups taken by the best other team. */
      readonly rival: number;
      readonly target: number;
    }
  | {
      readonly kind: 'merchant';
      readonly turn: number;
      readonly turns: number;
      /** Cells between the merchant and the edge it is making for; null once it is gone. */
      readonly cells: number | null;
    }
  | {
      readonly kind: 'ambush';
      readonly turn: number;
      readonly turns: number;
      /** Raiders afloat now. */
      readonly afloat: number;
      /** Raiders still to arrive. */
      readonly coming: number;
    };

/** The objective's progress, or null when the match has none. */
export function objectiveProgress(view: GameView): ObjectiveProgress | null {
  const objective = view.objective;
  if (!objective) {
    return null;
  }
  if (objective.kind === 'hunt') {
    return { kind: 'hunt', haul: view.self.haul ?? 0 };
  }
  if (objective.kind === 'survive') {
    return { kind: 'survive', turn: Math.min(view.turn, objective.turns), turns: objective.turns };
  }

  if (objective.kind === 'ambush') {
    const mine = view.self.teamId;
    const others = Object.values(view.ships).filter((ship) => ship.teamId !== mine);
    return {
      kind: 'ambush',
      turn: Math.min(view.turn, objective.turns),
      turns: objective.turns,
      afloat: others.filter((ship) => ship.hp > 0).length,
      coming: others.filter((ship) => ship.hp <= 0 && ship.arrivesOnTurn !== undefined).length,
    };
  }

  if (objective.kind === 'merchant') {
    const merchant = objective.shipId ? view.ships[objective.shipId] : undefined;
    const away =
      merchant && merchant.hp > 0 && objective.exit
        ? cellsToEdge(view.board, objective.exit, merchant.position)
        : null;
    return {
      kind: 'merchant',
      turn: Math.min(view.turn, objective.turns),
      turns: objective.turns,
      cells: away,
    };
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

/** How many cells a ship at `position` has to go to reach the given edge of the board. */
export function cellsToEdge(
  board: GameView['board'],
  edge: Direction,
  position: { x: number; y: number },
): number {
  switch (edge) {
    case 'EAST':
      return board.width - 1 - position.x;
    case 'WEST':
      return position.x;
    case 'NORTH':
      return position.y;
    case 'SOUTH':
      return board.height - 1 - position.y;
  }
}

/** Which text to show under the title of a finished match. */
export type EndNote =
  | 'survived'
  | 'objectiveFailed'
  | 'salvageWon'
  | 'salvageLost'
  | 'salvageDraw'
  | 'intercepted'
  | 'escaped'
  | 'merchantLost'
  | 'ambushBroken'
  | 'ambushOverrun'
  | 'ambushLost'
  | null;

export function endNote(
  view: GameView,
  result: 'win' | 'loss' | 'draw' | null,
  reason: OutcomeReason | undefined,
): EndNote {
  if (result === null || !view.objective || view.objective.kind === 'hunt') {
    return null;
  }
  if (view.objective.kind === 'ambush') {
    if (reason === 'ambush_broken' && result === 'win') {
      return 'ambushBroken';
    }
    if (reason === 'overrun' && result === 'loss') {
      return 'ambushOverrun';
    }
    if (reason === 'objective_failed' && result === 'loss') {
      return 'ambushLost';
    }
    return null;
  }
  if (view.objective.kind === 'merchant') {
    if (reason === 'intercepted' && result === 'win') {
      return 'intercepted';
    }
    if (reason === 'escaped' && result === 'loss') {
      return 'escaped';
    }
    if (reason === 'objective_failed' && result === 'loss') {
      return 'merchantLost';
    }
    return null;
  }
  if (view.objective.kind === 'salvage') {
    if (reason !== 'salvaged' && reason !== 'objective_failed' && result !== 'draw') {
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
