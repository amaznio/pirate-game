import type { GameState } from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { MovementAction } from '../domain/Action';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type { GameEvent } from '../domain/GameEvent';
import { translate } from '../domain/Position';
import { turnLeft, turnRight, vectorFor } from '../domain/Direction';
import type { MutableGameState } from './internal';
import { checkBlocked } from './collision';

/** One step forward in the given heading. */
export function getForwardPosition(
  position: Position,
  heading: Direction,
): Position {
  return translate(position, vectorFor(heading));
}

export interface TurnOutcome {
  readonly heading: Direction;
  readonly position: Position;
}

/**
 * A turning token is a diagonal step: the ship advances one cell in its
 * current heading AND one cell toward the turn side, ending with the heading
 * rotated 90 degrees that way (a ship cannot spin on the spot or slide
 * sideways, so it sweeps through a curve).
 */
function getTurnResult(
  position: Position,
  heading: Direction,
  nextHeading: Direction,
): TurnOutcome {
  return {
    heading: nextHeading,
    position: translate(
      getForwardPosition(position, heading),
      vectorFor(nextHeading),
    ),
  };
}

export function getLeftTurnResult(
  position: Position,
  heading: Direction,
): TurnOutcome {
  return getTurnResult(position, heading, turnLeft(heading));
}

export function getRightTurnResult(
  position: Position,
  heading: Direction,
): TurnOutcome {
  return getTurnResult(position, heading, turnRight(heading));
}

export interface ActionTarget {
  readonly heading: Direction;
  readonly position: Position;
}

/** Pure: where an action would take a ship, ignoring collision. */
export function resolveActionTarget(
  position: Position,
  heading: Direction,
  action: MovementAction,
): ActionTarget {
  switch (action) {
    case 'FORWARD':
      return { heading, position: getForwardPosition(position, heading) };
    case 'TURN_LEFT':
      return getLeftTurnResult(position, heading);
    case 'TURN_RIGHT':
      return getRightTurnResult(position, heading);
  }
}

/**
 * The cells an action passes through, in order. A turn is "forward, then
 * sideways", so the ship can be stopped after the first cell.
 */
export function movementPath(
  position: Position,
  heading: Direction,
  action: MovementAction,
): Position[] {
  const target = resolveActionTarget(position, heading, action);
  if (action === 'FORWARD') {
    return [target.position];
  }
  return [getForwardPosition(position, heading), target.position];
}

export interface MovementOutcome {
  readonly position: Position;
  readonly heading: Direction;
  /** The ship ended in a different cell. */
  readonly moved: boolean;
  /** The whole path was clear (nothing stopped the ship). */
  readonly completed: boolean;
}

/**
 * The single source of truth for what a movement action does to a ship. The
 * ship follows its path cell by cell and stops at the first blocked cell, so a
 * blocked turn still advances as far as it can. A turn always rotates the ship
 * toward the side it was trying to go, even when it could not move at all. A
 * blocked FORWARD has no side to turn toward, so it neither moves nor rotates.
 *
 * Pure and shared: the simulation applies it and the AI uses it to predict, so
 * every ship follows exactly the same rules.
 */
export function resolveMovementOutcome(
  state: GameState,
  shipId: string,
  position: Position,
  heading: Direction,
  action: MovementAction,
): MovementOutcome {
  const target = resolveActionTarget(position, heading, action);

  let reached = position;
  let completed = true;
  for (const cell of movementPath(position, heading, action)) {
    if (checkBlocked(state, cell, shipId).blocked) {
      completed = false;
      break;
    }
    reached = cell;
  }

  return {
    position: reached,
    heading: action === 'FORWARD' ? heading : target.heading,
    moved: reached !== position,
    completed,
  };
}

/**
 * Applies a movement action to a ship in the mutable draft using
 * resolveMovementOutcome. A ship that is stopped emits SHIP_BLOCKED after any
 * movement.
 */
export function applyMovementAction(
  state: MutableGameState,
  ship: Ship,
  action: MovementAction,
  phase: number,
): GameEvent[] {
  const outcome = resolveMovementOutcome(
    state,
    ship.id,
    ship.position,
    ship.heading,
    action,
  );
  const { position: reached, heading, moved, completed } = outcome;
  const events: GameEvent[] = [];

  if (heading !== ship.heading) {
    events.push({
      type: 'SHIP_TURNED',
      shipId: ship.id,
      from: ship.heading,
      to: heading,
      phase,
    });
  }

  if (moved || heading !== ship.heading) {
    state.ships[ship.id] = { ...ship, heading, position: reached };
  }

  if (moved) {
    events.push({
      type: 'SHIP_MOVED',
      shipId: ship.id,
      from: { ...ship.position },
      to: { ...reached },
      heading,
      phase,
    });
  }

  if (!completed) {
    events.push({
      type: 'SHIP_BLOCKED',
      shipId: ship.id,
      at: { ...reached },
      heading,
      action,
      phase,
    });
  }

  return events;
}
