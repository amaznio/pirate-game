import type { Direction } from '../domain/Direction';
import type { GameEvent } from '../domain/GameEvent';
import type { Position } from '../domain/Position';
import type { Board } from '../domain/Board';
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
 * Lets the merchant leave the match when it ends a phase's movement on the edge
 * it is making for. It happens before anyone fires, so a merchant that reaches
 * the edge is out of reach in that same phase. Only matches with a merchant
 * objective have an exit; for every other match this does nothing.
 */
export function resolveEscapes(state: MutableGameState, phase: number): GameEvent[] {
  const objective = state.objective;
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
