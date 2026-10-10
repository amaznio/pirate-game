import type { GameState } from '../domain/GameState';
import type { Ship } from '../domain/Ship';
import type { Spin, TerrainMap } from '../domain/Terrain';
import { terrainAt, whirlpoolDelta } from '../domain/Terrain';
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

/** What the board did to a ship after it had sailed, in the order it happened. */
export type TerrainEffect =
  | {
      readonly kind: 'push';
      readonly from: Position;
      readonly to: Position;
      readonly direction: Direction;
    }
  | {
      readonly kind: 'spin';
      readonly from: Position;
      /** Equal to `from` when another ship kept the ship from moving. */
      readonly to: Position;
      readonly fromHeading: Direction;
      readonly toHeading: Direction;
      readonly spin: Spin;
    };

export interface MovementOutcome {
  /** Where the ship ends the phase, after the wind and whirlpools. */
  readonly position: Position;
  readonly heading: Direction;
  /** The ship ended in a different cell than it started in. */
  readonly moved: boolean;
  /** The whole path was clear (nothing stopped the ship's own movement). */
  readonly completed: boolean;
  /** Where the ship's own movement left it, before the board acted on it. */
  readonly sailed: { readonly position: Position; readonly heading: Direction };
  readonly effects: readonly TerrainEffect[];
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
 * Works out which of the wanted moves (ship id -> the cell it wants to enter)
 * cannot happen. A move is stopped by the board edge, a rock, another ship
 * wanting the same cell, a swap, or a ship that stays in the cell. Every ship
 * involved in a conflict is stopped (no ship has priority), and the check
 * repeats until nothing changes, so the answer does not depend on ship order.
 * Ships that have no wanted move stay where they are and block that cell.
 */
function blockedMoves(
  state: GameState,
  living: readonly Ship[],
  positions: ReadonlyMap<EntityId, Position>,
  desired: ReadonlyMap<EntityId, Position>,
): Set<EntityId> {
  const blocked = new Set<EntityId>();

  // Terrain: the board edge and obstacles stop a ship outright.
  for (const [shipId, cell] of desired) {
    if (!inBounds(state.board, cell) || obstacleAt(state, cell)) {
      blocked.add(shipId);
    }
  }

  // Contested cells: every ship trying to enter the same cell is stopped.
  // This looks only at what ships want, never at who else got blocked, so
  // the result cannot depend on the order ships are checked in.
  const wanted = new Map<string, EntityId[]>();
  for (const [shipId, cell] of desired) {
    const key = `${cell.x},${cell.y}`;
    wanted.set(key, [...(wanted.get(key) ?? []), shipId]);
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
    for (const [shipId, cell] of desired) {
      if (blocked.has(shipId)) {
        continue;
      }
      const here = positions.get(shipId) as Position;

      for (const other of living) {
        if (other.id === shipId) {
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
          blocked.add(shipId);
          if (swapping) {
            blocked.add(other.id);
          }
          changed = true;
          break;
        }
      }
    }
  }

  return blocked;
}

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
 *
 * Then the board acts on every ship, whether or not it sailed this phase:
 *  - Wind: a ship that ends on a wind cell is pushed one cell the way it
 *    blows, once per phase (a ship carried onto more wind is pushed again in
 *    the next phase, not now). A push follows the same conflict rules as
 *    sailing; a ship whose push is stopped stays put.
 *  - Whirlpool: a ship that is then on a whirlpool is carried to the next cell
 *    of its ring and turned a quarter the same way. It is turned even if
 *    another ship kept it from moving.
 *
 * The result has an entry for every ship that sailed or that the board moved.
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
    const blocked = blockedMoves(state, living, positions, desired);

    for (const mover of active) {
      if (blocked.has(mover.shipId)) {
        mover.stopped = true;
      } else {
        mover.current = desired.get(mover.shipId) as Position;
        positions.set(mover.shipId, mover.current);
      }
    }
  }

  // Where each ship's own movement left it.
  const sailed = new Map<EntityId, { position: Position; heading: Direction }>();
  for (const mover of movers) {
    const target = resolveActionTarget(
      mover.start,
      mover.startHeading,
      mover.action,
    );
    sailed.set(mover.shipId, {
      position: mover.current,
      heading: mover.action === 'FORWARD' ? mover.startHeading : target.heading,
    });
  }

  // The sea only acts on a ship that ends on wind or a whirlpool, which is
  // rare for the hypothetical positions the AI tries, so check before the work.
  const effects =
    hasTerrain(state.terrain) &&
    living.some((ship) => terrainAt(state.terrain, positions.get(ship.id) as Position))
      ? applyTerrain(state, living, positions, sailed)
      : new Map<EntityId, TerrainEffect[]>();

  const outcomes = new Map<EntityId, MovementOutcome>();
  const stoppedMovers = new Set(
    movers.filter((mover) => mover.stopped).map((mover) => mover.shipId),
  );
  const sailingShips = new Set(movers.map((mover) => mover.shipId));
  for (const ship of living) {
    const shipEffects = effects.get(ship.id) ?? NO_EFFECTS;
    if (!sailingShips.has(ship.id) && shipEffects.length === 0) {
      continue;
    }
    const position = positions.get(ship.id) as Position;
    const sailedTo = sailed.get(ship.id) ?? {
      position: ship.position,
      heading: ship.heading,
    };
    const last = shipEffects[shipEffects.length - 1];
    const spun = shipEffects.filter((effect) => effect.kind === 'spin');
    const heading =
      spun.length > 0
        ? (spun[spun.length - 1] as { toHeading: Direction }).toHeading
        : sailedTo.heading;
    outcomes.set(ship.id, {
      position,
      heading,
      moved: !positionsEqual(position, ship.position),
      completed: !stoppedMovers.has(ship.id),
      sailed: sailedTo,
      effects: last ? shipEffects : NO_EFFECTS,
    });
  }
  return outcomes;
}

const NO_EFFECTS: readonly TerrainEffect[] = [];

const terrainPresence = new WeakMap<object, boolean>();

/** Whether the board has any wind or whirlpool at all (cached per map). */
function hasTerrain(terrain: TerrainMap | undefined): boolean {
  if (!terrain) {
    return false;
  }
  let present = terrainPresence.get(terrain);
  if (present === undefined) {
    present = Object.keys(terrain).length > 0;
    terrainPresence.set(terrain, present);
  }
  return present;
}

/**
 * The wind and whirlpool stages. Moves `positions` along and records what
 * happened to each ship. Whirlpool turns are written into `sailed` headings'
 * successors through the returned effects (the caller reads the last turn).
 */
function applyTerrain(
  state: GameState,
  living: readonly Ship[],
  positions: Map<EntityId, Position>,
  sailed: ReadonlyMap<EntityId, { position: Position; heading: Direction }>,
): Map<EntityId, TerrainEffect[]> {
  const effects = new Map<EntityId, TerrainEffect[]>();
  const record = (shipId: EntityId, effect: TerrainEffect): void => {
    effects.set(shipId, [...(effects.get(shipId) ?? []), effect]);
  };

  // Wind: one push per ship per phase.
  const windMoves = new Map<EntityId, Position>();
  const pushes = new Map<EntityId, Direction>();
  for (const ship of living) {
    const cell = positions.get(ship.id) as Position;
    const here = terrainAt(state.terrain, cell);
    if (here?.kind === 'wind') {
      windMoves.set(ship.id, translate(cell, vectorFor(here.direction)));
      pushes.set(ship.id, here.direction);
    }
  }
  if (windMoves.size > 0) {
    const blocked = blockedMoves(state, living, positions, windMoves);
    for (const [shipId, to] of windMoves) {
      if (blocked.has(shipId)) {
        continue;
      }
      record(shipId, {
        kind: 'push',
        from: positions.get(shipId) as Position,
        to,
        direction: pushes.get(shipId) as Direction,
      });
      positions.set(shipId, to);
    }
  }

  // Whirlpools.
  const desired = new Map<EntityId, Position>();
  const spins = new Map<EntityId, Spin>();
  for (const ship of living) {
    const cell = positions.get(ship.id) as Position;
    const here = terrainAt(state.terrain, cell);
    if (here?.kind === 'whirlpool') {
      desired.set(
        ship.id,
        translate(cell, whirlpoolDelta(here.spin, here.corner)),
      );
      spins.set(ship.id, here.spin);
    }
  }
  if (desired.size > 0) {
    const blocked = blockedMoves(state, living, positions, desired);
    for (const [shipId, to] of desired) {
      const from = positions.get(shipId) as Position;
      const spin = spins.get(shipId) as Spin;
      const fromHeading = (sailed.get(shipId)?.heading ??
        (state.ships[shipId] as Ship).heading) as Direction;
      const moves = !blocked.has(shipId);
      if (moves) {
        positions.set(shipId, to);
      }
      record(shipId, {
        kind: 'spin',
        from,
        to: moves ? to : from,
        fromHeading,
        toHeading: spin === 'right' ? turnRight(fromHeading) : turnLeft(fromHeading),
        spin,
      });
    }
  }

  return effects;
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
 * Where a ship ends a phase in which it does not sail, if every other ship
 * stood still. Only the sea can move it: wind carries it, a whirlpool turns it.
 */
export function resolveHoldOutcome(
  state: GameState,
  shipId: EntityId,
  position: Position,
  heading: Direction,
): { readonly position: Position; readonly heading: Direction } {
  if (!hasTerrain(state.terrain) || !terrainAt(state.terrain, position)) {
    return { position, heading };
  }
  const ship = state.ships[shipId];
  const hypothetical: GameState = {
    ...state,
    ships: { ...state.ships, [shipId]: { ...ship, position, heading } },
  };
  return resolveMovementPhase(hypothetical, []).get(shipId) ?? { position, heading };
}

/**
 * Applies one phase of movement for all given ships to the mutable draft and
 * returns the events. A ship that is stopped emits SHIP_BLOCKED after any
 * movement, and a turn emits SHIP_TURNED even if the ship could not move. The
 * pushes and spins of the board follow, once every ship has sailed.
 */
export function applyMovementPhase(
  state: MutableGameState,
  intents: readonly MovementIntent[],
  phase: number,
): GameEvent[] {
  const outcomes = resolveMovementPhase(state, intents);
  const actions = new Map(intents.map((intent) => [intent.shipId, intent.action]));
  const sailing: GameEvent[] = [];
  const board: GameEvent[] = [];

  for (const [shipId, outcome] of outcomes) {
    const ship = state.ships[shipId];
    if (!ship) {
      continue;
    }
    const { sailed, completed } = outcome;

    if (sailed.heading !== ship.heading) {
      sailing.push({
        type: 'SHIP_TURNED',
        shipId,
        from: ship.heading,
        to: sailed.heading,
        phase,
      });
    }

    if (!positionsEqual(sailed.position, ship.position)) {
      sailing.push({
        type: 'SHIP_MOVED',
        shipId,
        from: { ...ship.position },
        to: { ...sailed.position },
        heading: sailed.heading,
        phase,
      });
    }

    const action = actions.get(shipId);
    if (!completed && action) {
      sailing.push({
        type: 'SHIP_BLOCKED',
        shipId,
        at: { ...sailed.position },
        heading: sailed.heading,
        action,
        phase,
      });
    }

    for (const effect of outcome.effects) {
      if (effect.kind === 'push') {
        board.push({
          type: 'SHIP_PUSHED',
          shipId,
          from: { ...effect.from },
          to: { ...effect.to },
          direction: effect.direction,
          phase,
        });
      } else {
        board.push({
          type: 'SHIP_SPUN',
          shipId,
          from: { ...effect.from },
          to: { ...effect.to },
          fromHeading: effect.fromHeading,
          toHeading: effect.toHeading,
          spin: effect.spin,
          phase,
        });
      }
    }

    if (outcome.moved || outcome.heading !== ship.heading) {
      state.ships[shipId] = {
        ...ship,
        heading: outcome.heading,
        position: outcome.position,
      };
    }
  }

  return [...sailing, ...board];
}
