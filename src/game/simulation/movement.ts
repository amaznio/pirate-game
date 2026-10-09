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
 * A turning token rotates the heading 90 degrees and then moves one cell in
 * the new heading (it is NOT rotation in place).
 */
export function getLeftTurnResult(
  position: Position,
  heading: Direction,
): TurnOutcome {
  const nextHeading = turnLeft(heading);
  return {
    heading: nextHeading,
    position: getForwardPosition(position, nextHeading),
  };
}

export function getRightTurnResult(
  position: Position,
  heading: Direction,
): TurnOutcome {
  const nextHeading = turnRight(heading);
  return {
    heading: nextHeading,
    position: getForwardPosition(position, nextHeading),
  };
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
 * Applies a movement action to a ship in the mutable draft. Collision is
 * decided here; blocked ships do not move or turn and emit SHIP_BLOCKED.
 */
export function applyMovementAction(
  state: MutableGameState,
  ship: Ship,
  action: MovementAction,
  phase: number,
): GameEvent[] {
  const target = resolveActionTarget(ship.position, ship.heading, action);
  const collision = checkBlocked(state, target.position, ship.id);

  if (collision.blocked) {
    return [
      {
        type: 'SHIP_BLOCKED',
        shipId: ship.id,
        at: { ...ship.position },
        heading: ship.heading,
        action,
        phase,
      },
    ];
  }

  const events: GameEvent[] = [];
  if (target.heading !== ship.heading) {
    events.push({
      type: 'SHIP_TURNED',
      shipId: ship.id,
      from: ship.heading,
      to: target.heading,
      phase,
    });
  }

  state.ships[ship.id] = {
    ...ship,
    heading: target.heading,
    position: target.position,
  };

  events.push({
    type: 'SHIP_MOVED',
    shipId: ship.id,
    from: { ...ship.position },
    to: { ...target.position },
    heading: target.heading,
    phase,
  });

  return events;
}
