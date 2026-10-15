import type { Direction } from './Direction';
import { turnLeft, turnRight, vectorFor } from './Direction';
import type { ActionSlot } from './Action';
import type { Entity, EntityId } from './Entity';
import type { Position } from './Position';
import { translate } from './Position';

/** Which creature a monster is. Its numbers live in `config/monsterTypes.ts`. */
export type MonsterTypeId = 'giant-squid' | 'squid' | 'shark' | 'tentacle';

/** Where a lash lands, as seen from the monster: beside its bow, or ahead of it. */
export type LashSide = 'left' | 'right' | 'front';

/**
 * What a monster has decided to do in a turn, slot by slot like a ship's plan:
 * the same movement actions a ship uses (forward, turn left, turn right), and
 * a lash (or none) in each phase. Planned at the start of the turn and, like a
 * ship's plan, never shown to players.
 */
export interface MonsterPlan {
  readonly movement: readonly ActionSlot[];
  readonly lashes: readonly (LashSide | null)[];
  /**
   * For a monster with no front (a tentacle): the way it steps in each phase,
   * in place of `movement`. It takes that heading for the phase and sails forward.
   */
  readonly steps?: readonly (Direction | null)[];
  /** For a monster with no front: the way it strikes in each phase it lashes. */
  readonly aims?: readonly (Direction | null)[];
}

/**
 * One lash as it is expected to land, worked out when the plan is made from
 * where the monster would be if nothing got in its way. It is only a forecast
 * (the lash lands where the monster really is), and players are shown it only
 * when the match warns them.
 */
export interface MonsterAttack {
  readonly phase: number;
  readonly cell: Position;
  readonly side: LashSide;
}

/**
 * A creature that is not a ship: it sits on the water over one or two cells,
 * blocks ships and shots like a rock, can be sunk, and lashes the cells ahead
 * of or beside its bow. It belongs to no team and does not count for "last team
 * standing". A one-cell monster may sail (it moves, and is carried by wind and
 * whirlpools, exactly as a ship does); a bigger one never moves.
 *
 * `position` is the stern (tail) cell; the monster faces `heading` and its
 * body continues that way, so a two-cell monster also fills the cell ahead.
 */
export interface Monster extends Entity {
  readonly kind: 'monster';
  readonly monsterTypeId: MonsterTypeId;
  readonly heading: Direction;
  readonly hp: number;
  readonly maxHp: number;
  /** The boss of a hunt: bigger hull, a title, and the biggest drop. Absent for every other monster. */
  readonly boss?: true;
  /** The monster that surfaced this one; it sinks when that one does. None for a monster that began the match. */
  readonly parentId?: EntityId;
  /** The turn this monster rose out of the water; it does not act that turn, so everyone sees it first. */
  readonly surfacedOnTurn?: number;
  /** How many of its hull thresholds a monster that surfaces others has already answered with a wave. */
  readonly spawnWaves?: number;
  /** This turn's plan. Present from the start of the turn until it has been played; never in a player's view. */
  readonly plan?: MonsterPlan;
  /** The forecast of this turn's lashes. Empty when it is not planning, and hidden unless the match warns. */
  readonly attacks: readonly MonsterAttack[];
}

export type MonsterMap = Readonly<Record<EntityId, Monster>>;

export function isMonster(entity: Entity): entity is Monster {
  return entity.kind === 'monster';
}

/** The cells a monster fills, from the stern to the bow. */
export function monsterCells(
  monster: Pick<Monster, 'position' | 'heading'>,
  length: number,
): Position[] {
  const cells: Position[] = [];
  let cursor = monster.position;
  for (let index = 0; index < length; index += 1) {
    cells.push(cursor);
    cursor = translate(cursor, vectorFor(monster.heading));
  }
  return cells;
}

/** The cell a monster lashes for each side, given the bow cell it strikes from. */
export function lashCell(heading: Direction, bow: Position, side: LashSide): Position {
  const direction =
    side === 'front' ? heading : side === 'left' ? turnLeft(heading) : turnRight(heading);
  return translate(bow, vectorFor(direction));
}
