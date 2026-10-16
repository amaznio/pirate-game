import type { Direction } from '../domain/Direction';
import type { GameEvent } from '../domain/GameEvent';
import type { Position } from '../domain/Position';
import type { Board } from '../domain/Board';
import { ACTIONS_PER_TURN } from '../domain/Action';
import { EXIT_DEPTH } from '../domain/Objective';
import type { SubmittedActions } from '../domain/TurnResult';
import type { MutableGameState } from './internal';

/** Whether a cell is on the edge of the board a ship is making for. */
export function onExitEdge(board: Board, exit: Direction, position: Position): boolean {
  switch (exit) {
    case 'EAST':
      return position.x >= board.width - 1;
    case 'WEST':
      return position.x <= 0;
    case 'NORTH':
      return position.y <= 0;
    case 'SOUTH':
      return position.y >= board.height - 1;
  }
}

/**
 * Whether a cell is in the exit area: the `depth` outermost rows along the edge
 * a ship is leaving by. A hero in a hunt leaves from here.
 */
export function inExitArea(board: Board, exit: Direction, position: Position, depth: number): boolean {
  switch (exit) {
    case 'EAST':
      return position.x >= board.width - depth;
    case 'WEST':
      return position.x < depth;
    case 'NORTH':
      return position.y < depth;
    case 'SOUTH':
      return position.y >= board.height - depth;
  }
}

/**
 * Lets the merchant leave the match when it ends a phase's movement on the edge
 * it is making for. It happens before anyone fires, so a merchant that reaches
 * the edge is out of reach in that same phase. Only matches with a merchant
 * objective have an exit; for every other match this does nothing.
 */
export function resolveEscapes(
  state: MutableGameState,
  phase: number,
  submitted: SubmittedActions = {},
): GameEvent[] {
  const objective = state.objective;
  if (objective?.kind === 'hunt') {
    return resolveLeaving(state, phase, submitted);
  }
  if (objective?.kind !== 'merchant' || !objective.shipId || !objective.exit) {
    return [];
  }
  const ship = state.ships[objective.shipId];
  if (!ship || ship.hp <= 0 || !onExitEdge(state.board, objective.exit, ship.position)) {
    return [];
  }
  state.ships[ship.id] = { ...ship, hp: 0, escaped: true };
  return [{ type: 'SHIP_ESCAPED', shipId: ship.id, at: { ...ship.position }, phase }];
}

/**
 * A hero that chose to leave, and ends the turn (the last phase) in the exit area,
 * sails off with its haul. Leaving is a choice, not something touching the edge
 * does, because the hero starts beside the exit.
 */
function resolveLeaving(state: MutableGameState, phase: number, submitted: SubmittedActions): GameEvent[] {
  const objective = state.objective;
  if (objective?.kind !== 'hunt' || !objective.exit || phase !== ACTIONS_PER_TURN - 1) {
    return [];
  }
  const events: GameEvent[] = [];
  for (const player of Object.values(state.players)) {
    const ship = state.ships[player.shipId];
    if (
      !ship ||
      ship.hp <= 0 ||
      !submitted[player.id]?.leave ||
      !inExitArea(state.board, objective.exit, ship.position, EXIT_DEPTH)
    ) {
      continue;
    }
    state.ships[ship.id] = { ...ship, hp: 0, escaped: true, hullOnExit: ship.hp };
    events.push({ type: 'SHIP_ESCAPED', shipId: ship.id, at: { ...ship.position }, phase });
  }
  return events;
}
