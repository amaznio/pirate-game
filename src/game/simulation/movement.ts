import type { GameState } from '../domain/GameState';
import type { MovementAction } from '../domain/Action';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type { GameEvent } from '../domain/GameEvent';
import type { EntityId } from '../domain/Entity';
import { inBounds } from '../domain/Board';
import { positionsEqual, translate } from '../domain/Position';
import { turnLeft, turnRight, vectorFor } from '../domain/Direction';
import type { MutableGameState } from './internal';
import { obstacleAt } from './selectors';

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

export interface MovementIntent {
  readonly shipId: EntityId;
  readonly action: MovementAction;
}

interface Mover {
  readonly shipId: EntityId;
  readonly action: MovementAction;
  readonly path: Position[];
  readonly start: Position;
  readonly startHeading: Direction;
  current: Position;
  stopped: boolean;
}

const MAX_PATH_LENGTH = 2;

/**
 * Resolves one phase of movement for every ship at once. This is the single
 * source of truth for movement rules; the simulation applies its result and
 * the AI and plan preview use it to predict, so every ship follows exactly the
 * same rules.
 *
 * Rules:
 *  - Ships take their path one cell at a time, all at the same time. A turn is
 *    "forward, then sideways", so it can be stopped after the first cell.
 *  - A ship is stopped by the board edge, an obstacle, or a conflict. A
 *    conflict is two ships trying to enter the same cell, two ships swapping
 *    cells, or a ship entering a cell where another ship stays. Every ship
 *    involved in a conflict stays where it is (no ship has priority).
 *  - A ship may follow another that is leaving a cell. The check repeats until
 *    nothing changes, so the result does not depend on ship order.
 *  - A turn always rotates the ship toward the turn side, even when it could
 *    not move. A blocked FORWARD neither moves nor rotates.
 *  - Ships that have no intent stay put and block the cell they occupy.
 */
export function resolveMovementPhase(
  state: GameState,
  intents: readonly MovementIntent[],
): Map<EntityId, MovementOutcome> {
  const living = Object.values(state.ships).filter((ship) => ship.hp > 0);
  const positions = new Map<EntityId, Position>(
    living.map((ship) => [ship.id, ship.position]),
  );

  const movers: Mover[] = [];
  for (const intent of intents) {
    const ship = state.ships[intent.shipId];
    if (!ship || ship.hp <= 0) {
      continue;
    }
    movers.push({
      shipId: ship.id,
      action: intent.action,
      path: movementPath(ship.position, ship.heading, intent.action),
      start: ship.position,
      startHeading: ship.heading,
      current: ship.position,
      stopped: false,
    });
  }

  for (let step = 0; step < MAX_PATH_LENGTH; step += 1) {
    const active = movers.filter(
      (mover) => !mover.stopped && step < mover.path.length,
    );
    if (active.length === 0) {
      break;
    }

    const desired = new Map<EntityId, Position>(
      active.map((mover) => [mover.shipId, mover.path[step]]),
    );
    const blocked = new Set<EntityId>();

    // Terrain: the board edge and obstacles stop a ship outright.
    for (const mover of active) {
      const cell = desired.get(mover.shipId) as Position;
      if (!inBounds(state.board, cell) || obstacleAt(state, cell)) {
        blocked.add(mover.shipId);
      }
    }

    // Contested cells: every ship trying to enter the same cell is stopped.
    // This looks only at what ships want, never at who else got blocked, so
    // the result cannot depend on the order ships are checked in.
    const wanted = new Map<string, EntityId[]>();
    for (const mover of active) {
      const cell = desired.get(mover.shipId) as Position;
      const key = `${cell.x},${cell.y}`;
      wanted.set(key, [...(wanted.get(key) ?? []), mover.shipId]);
    }
    for (const claimants of wanted.values()) {
      if (claimants.length > 1) {
        claimants.forEach((id) => blocked.add(id));
      }
    }

    // Occupied cells and swaps, repeated until stable (a ship that is stopped
    // stays in its cell, which can in turn stop the ship behind it).
    let changed = true;
    while (changed) {
      changed = false;
      for (const mover of active) {
        if (blocked.has(mover.shipId)) {
          continue;
        }
        const cell = desired.get(mover.shipId) as Position;
        const here = positions.get(mover.shipId) as Position;

        for (const other of living) {
          if (other.id === mover.shipId) {
            continue;
          }
          const otherPosition = positions.get(other.id) as Position;
          const otherLeaves = desired.has(other.id) && !blocked.has(other.id);

          const enteringOccupiedCell =
            !otherLeaves && positionsEqual(otherPosition, cell);
          const swapping =
            otherLeaves &&
            positionsEqual(desired.get(other.id) as Position, here) &&
            positionsEqual(otherPosition, cell);

          if (enteringOccupiedCell || swapping) {
            blocked.add(mover.shipId);
            if (swapping) {
              blocked.add(other.id);
            }
            changed = true;
            break;
          }
        }
      }
    }

    for (const mover of active) {
      if (blocked.has(mover.shipId)) {
        mover.stopped = true;
      } else {
        mover.current = desired.get(mover.shipId) as Position;
        positions.set(mover.shipId, mover.current);
      }
    }
  }

  const outcomes = new Map<EntityId, MovementOutcome>();
  for (const mover of movers) {
    const target = resolveActionTarget(
      mover.start,
      mover.startHeading,
      mover.action,
    );
    outcomes.set(mover.shipId, {
      position: mover.current,
      heading: mover.action === 'FORWARD' ? mover.startHeading : target.heading,
      moved: !positionsEqual(mover.current, mover.start),
      completed: !mover.stopped,
    });
  }
  return outcomes;
}

/**
 * What a single ship would do with an action if every other ship stood still.
 * Used by the AI and plan preview to predict a ship's own movement from a
 * hypothetical position and heading, using the same rules as the simulation.
 */
export function resolveMovementOutcome(
  state: GameState,
  shipId: EntityId,
  position: Position,
  heading: Direction,
  action: MovementAction,
): MovementOutcome {
  const ship = state.ships[shipId];
  const hypothetical: GameState = {
    ...state,
    ships: { ...state.ships, [shipId]: { ...ship, position, heading } },
  };
  return resolveMovementPhase(hypothetical, [{ shipId, action }]).get(
    shipId,
  ) as MovementOutcome;
}

/**
 * Applies one phase of movement for all given ships to the mutable draft and
 * returns the events. A ship that is stopped emits SHIP_BLOCKED after any
 * movement, and a turn emits SHIP_TURNED even if the ship could not move.
 */
export function applyMovementPhase(
  state: MutableGameState,
  intents: readonly MovementIntent[],
  phase: number,
): GameEvent[] {
  const outcomes = resolveMovementPhase(state, intents);
  const events: GameEvent[] = [];

  for (const intent of intents) {
    const outcome = outcomes.get(intent.shipId);
    const ship = state.ships[intent.shipId];
    if (!outcome || !ship) {
      continue;
    }
    const { position, heading, moved, completed } = outcome;

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
      state.ships[ship.id] = { ...ship, heading, position };
    }

    if (moved) {
      events.push({
        type: 'SHIP_MOVED',
        shipId: ship.id,
        from: { ...ship.position },
        to: { ...position },
        heading,
        phase,
      });
    }

    if (!completed) {
      events.push({
        type: 'SHIP_BLOCKED',
        shipId: ship.id,
        at: { ...position },
        heading,
        action: intent.action,
        phase,
      });
    }
  }

  return events;
}
