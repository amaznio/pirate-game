import type { AiDifficulty, GameState } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import type { PlayerId } from '../domain/Entity';
import type { Ship } from '../domain/Ship';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type {
  ActionSlot,
  CannonSide,
  CannonSlot,
  MovementAction,
  TokenInventory,
} from '../domain/Action';
import { ACTIONS_PER_TURN, CANNON_SIDES, cloneInventory } from '../domain/Action';
import { inBounds } from '../domain/Board';
import { DIRECTIONS, leftBroadside, rightBroadside, vectorFor } from '../domain/Direction';
import { positionsEqual, translate } from '../domain/Position';
import { isShip } from '../domain/Ship';
import { blockingEntityAt, getHostiles, getShipByOwner } from '../simulation/selectors';
import {
  resolveHoldOutcome,
  resolveMovementOutcome,
  type MovementOutcome,
} from '../simulation/movement';
import { firstEntityAlongRay } from '../simulation/collision';
import { getWeaponType } from '../config/weaponTypes';
import type { AIController } from './AIController';
import { profileFor, type AiProfile } from './profiles';
import { createRng } from './rng';

/** Each phase either holds (no token spent) or plays one movement token. */
const OPTIONS: ReadonlyArray<MovementAction | null> = [
  null,
  'FORWARD',
  'TURN_LEFT',
  'TURN_RIGHT',
];

interface Candidate {
  readonly movement: ActionSlot[];
  readonly cannons: CannonSlot[];
  readonly score: number;
  readonly tokensUsed: number;
  readonly order: number;
}

/** Everything one planning run needs, with caches for the repeated lookups. */
interface Planning {
  readonly state: GameState;
  readonly me: Ship;
  readonly target: Ship;
  readonly hostiles: readonly Ship[];
  readonly profile: AiProfile;
  /** Cannon range and damage of this ship's broadsides. */
  readonly range: number;
  readonly damage: number;
  readonly outcomes: Map<string, MovementOutcome>;
  readonly victims: Map<string, Ship | null>;
  readonly threats: Map<string, number>;
  /** Moves still needed from each (cell, heading) to fire at the target; built on first use. */
  goalSteps: Map<string, number> | null;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function broadsideDirection(heading: Direction, side: CannonSide): Direction {
  return side === 'left' ? leftBroadside(heading) : rightBroadside(heading);
}

/** What this ship would do with an action from a hypothetical spot (cached). */
function outcomeOf(
  plan: Planning,
  position: Position,
  heading: Direction,
  action: MovementAction,
): MovementOutcome {
  const key = `${position.x},${position.y},${heading},${action}`;
  let outcome = plan.outcomes.get(key);
  if (!outcome) {
    outcome = resolveMovementOutcome(plan.state, plan.me.id, position, heading, action);
    plan.outcomes.set(key, outcome);
  }
  return outcome;
}

/** Where holding still for a phase leaves this ship: the sea may still carry it. */
function holdOf(
  plan: Planning,
  position: Position,
  heading: Direction,
): { position: Position; heading: Direction } {
  return resolveHoldOutcome(plan.state, plan.me.id, position, heading);
}

/** The enemy ship a broadside would hit from here, if any (cached). */
function victimOf(
  plan: Planning,
  position: Position,
  heading: Direction,
  side: CannonSide,
): Ship | null {
  const key = `${position.x},${position.y},${heading},${side}`;
  const cached = plan.victims.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const mounted = plan.me.weapons.some((weapon) => weapon.side === side);
  let victim: Ship | null = null;
  if (mounted) {
    const hit = firstEntityAlongRay(
      plan.state,
      position,
      broadsideDirection(heading, side),
      plan.range,
      plan.me.id,
    );
    if (
      hit &&
      isShip(hit.entity) &&
      hit.entity.hp > 0 &&
      hit.entity.teamId !== plan.me.teamId
    ) {
      victim = hit.entity;
    }
  }
  plan.victims.set(key, victim);
  return victim;
}

/** How many enemy broadsides (as they are now) would cover this cell. */
function threatsAt(plan: Planning, position: Position): number {
  const key = `${position.x},${position.y}`;
  const cached = plan.threats.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let count = 0;
  for (const enemy of plan.hostiles) {
    for (const side of CANNON_SIDES) {
      const mount = enemy.weapons.find((weapon) => weapon.side === side);
      if (!mount) {
        continue;
      }
      const direction = broadsideDirection(enemy.heading, side);
      const range = getWeaponType(mount.weaponTypeId).range;
      let cursor = enemy.position;
      for (let step = 0; step < range; step += 1) {
        cursor = translate(cursor, vectorFor(direction));
        if (!inBounds(plan.state.board, cursor)) {
          break;
        }
        if (positionsEqual(cursor, position)) {
          count += 1;
          break;
        }
        // Rocks and other ships stop a shot (this ship is moving, so ignore it).
        if (blockingEntityAt(plan.state, cursor, plan.me.id)) {
          break;
        }
      }
    }
  }
  plan.threats.set(key, count);
  return count;
}

/** Stands in for "cannot get there from here" in the step counts. */
const UNREACHABLE_STEPS = 40;

const stateKey = (position: Position, heading: Direction): string =>
  `${position.x},${position.y},${heading}`;

/**
 * For every free cell and heading on the board, how many moves it takes to
 * reach a position from which a broadside hits the target. It is a breadth-
 * first search backwards from the firing positions over the real movement
 * rules, so it knows that getting beside a target sometimes means zig-zagging
 * round it, and never gets stuck on a spot that merely looks promising.
 */
function goalStepsOf(plan: Planning): Map<string, number> {
  if (plan.goalSteps) {
    return plan.goalSteps;
  }

  const { board } = plan.state;
  const incoming = new Map<string, string[]>();
  const firing: string[] = [];

  for (let x = 0; x < board.width; x += 1) {
    for (let y = 0; y < board.height; y += 1) {
      const position = { x, y };
      if (blockingEntityAt(plan.state, position, plan.me.id)) {
        continue;
      }
      for (const heading of DIRECTIONS) {
        const here = stateKey(position, heading);
        if (CANNON_SIDES.some((side) => victimOf(plan, position, heading, side)?.id === plan.target.id)) {
          firing.push(here);
        }
        for (const action of OPTIONS) {
          // Holding costs nothing, but on wind or a whirlpool the sea still
          // moves the ship, which is a free way to go somewhere.
          let outcome: { position: Position; heading: Direction; moved: boolean };
          if (action === null) {
            const held = holdOf(plan, position, heading);
            outcome = { ...held, moved: !positionsEqual(held.position, position) };
          } else {
            outcome = outcomeOf(plan, position, heading, action);
          }
          if (!outcome.moved && outcome.heading === heading) {
            continue;
          }
          const next = stateKey(outcome.position, outcome.heading);
          const sources = incoming.get(next);
          if (sources) {
            sources.push(here);
          } else {
            incoming.set(next, [here]);
          }
        }
      }
    }
  }

  const steps = new Map<string, number>();
  let frontier = firing;
  for (const key of frontier) {
    steps.set(key, 0);
  }
  for (let depth = 1; frontier.length > 0 && depth < UNREACHABLE_STEPS; depth += 1) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const source of incoming.get(key) ?? []) {
        if (!steps.has(source)) {
          steps.set(source, depth);
          next.push(source);
        }
      }
    }
    frontier = next;
  }

  plan.goalSteps = steps;
  return steps;
}

/**
 * How good a final position is: mainly how few moves it is from a firing
 * position, then plain distance as a tie-breaker, then (hard) how exposed it is.
 */
function placement(plan: Planning, position: Position, heading: Direction): number {
  const { profile, target } = plan;
  const steps = goalStepsOf(plan).get(stateKey(position, heading)) ?? UNREACHABLE_STEPS;

  let value = -(
    profile.approachWeight * steps +
    profile.distanceWeight * manhattan(position, target.position)
  );

  if (profile.dangerWeight > 0) {
    value -= profile.dangerWeight * threatsAt(plan, position);
  }
  if (profile.edgeWeight > 0) {
    const { width, height } = plan.state.board;
    const edge = Math.min(position.x, position.y, width - 1 - position.x, height - 1 - position.y);
    value -= profile.edgeWeight * Math.max(0, 2 - edge);
  }
  return value;
}

/**
 * Tries every way of spending this turn's four phases (hold, or play a token
 * it still holds) and scores each complete plan. At most 4^4 = 256 plans, so
 * it can afford to look at all of them.
 */
function search(
  plan: Planning,
  phase: number,
  position: Position,
  heading: Direction,
  pool: TokenInventory,
  ammoLeft: number,
  movement: ActionSlot[],
  cannons: CannonSlot[],
  shotScore: number,
  tokensUsed: number,
  out: Candidate[],
): void {
  if (phase === ACTIONS_PER_TURN) {
    out.push({
      movement: [...movement],
      cannons: cannons.map((slot) => ({ ...slot })),
      score:
        shotScore -
        plan.profile.tokenCost * tokensUsed +
        placement(plan, position, heading),
      tokensUsed,
      order: out.length,
    });
    return;
  }

  for (const option of OPTIONS) {
    let nextPosition = position;
    let nextHeading = heading;

    if (option === null) {
      const held = holdOf(plan, position, heading);
      nextPosition = held.position;
      nextHeading = held.heading;
    } else {
      if (pool[option] <= 0 || tokensUsed >= plan.profile.maxMoves) {
        continue;
      }
      const outcome = outcomeOf(plan, position, heading, option);
      if (!outcome.moved && outcome.heading === heading) {
        continue; // a move that does nothing is just a wasted token
      }
      nextPosition = outcome.position;
      nextHeading = outcome.heading;
      pool[option] -= 1;
    }

    // Fire whatever lines up, as long as cannonballs last.
    let ammo = ammoLeft;
    let value = 0;
    const fires = { left: false, right: false };
    for (const side of CANNON_SIDES) {
      if (ammo <= 0) {
        break;
      }
      const victim = victimOf(plan, nextPosition, nextHeading, side);
      if (victim) {
        fires[side] = true;
        ammo -= 1;
        value +=
          plan.profile.hitValue +
          (victim.hp <= plan.damage ? plan.profile.killBonus : 0);
      }
    }

    movement.push(option);
    cannons.push(fires);
    search(
      plan,
      phase + 1,
      nextPosition,
      nextHeading,
      pool,
      ammo,
      movement,
      cannons,
      shotScore + value,
      tokensUsed + (option === null ? 0 : 1),
      out,
    );
    movement.pop();
    cannons.pop();
    if (option !== null) {
      pool[option] += 1;
    }
  }
}

/** The nearest living hostile ship (ties broken by id for determinism). */
function chooseTarget(state: GameState, me: Ship): Ship | undefined {
  return getHostiles(state, me).sort(
    (a, b) =>
      manhattan(me.position, a.position) - manhattan(me.position, b.position) ||
      a.id.localeCompare(b.id),
  )[0];
}

/**
 * Plans one AI player's turn. The AI considers every plan it can afford with
 * the movement tokens it actually holds, scores each, and plays the best one;
 * its difficulty (see profiles.ts) decides what it values and how often it
 * settles for something worse. It assumes the other ships stay where they are.
 *
 * Deterministic: the same state and difficulty always give the same plan.
 */
export function planAiActions(
  state: GameState,
  playerId: PlayerId,
  difficulty?: AiDifficulty,
): PlayerActions {
  const player = state.players[playerId];
  const me = getShipByOwner(state, playerId);
  const target = me ? chooseTarget(state, me) : undefined;
  if (!player || !me || !target || me.hp <= 0) {
    return { movement: [], cannons: [] };
  }

  const profile = profileFor(difficulty ?? player.aiDifficulty);
  const mount = me.weapons[0];
  const weapon = mount ? getWeaponType(mount.weaponTypeId) : null;

  const plan: Planning = {
    state,
    me,
    target,
    hostiles: getHostiles(state, me),
    profile,
    range: weapon?.range ?? 0,
    damage: weapon?.damage ?? 1,
    outcomes: new Map(),
    victims: new Map(),
    threats: new Map(),
    goalSteps: null,
  };

  const candidates: Candidate[] = [];
  search(
    plan,
    0,
    me.position,
    me.heading,
    cloneInventory(player.tokens),
    player.ammo,
    [],
    [],
    0,
    0,
    candidates,
  );

  // Best first; between equal plans prefer the one that spends fewer tokens.
  candidates.sort(
    (a, b) => b.score - a.score || a.tokensUsed - b.tokensUsed || a.order - b.order,
  );

  const rng = createRng(state.seed, state.turn, playerId);
  let chosen = candidates[0];
  if (profile.mistakeRate > 0 && candidates.length > 1 && rng() < profile.mistakeRate) {
    const options = candidates.slice(0, profile.mistakePool);
    chosen = options[Math.floor(rng() * options.length)];
  }

  // A distracted AI sometimes lets a shot go by.
  const keepShot = (wanted: boolean): boolean =>
    wanted && (profile.fireChance >= 1 || rng() < profile.fireChance);
  const cannons: CannonSlot[] = chosen.cannons.map((slot) => ({
    left: keepShot(slot.left),
    right: keepShot(slot.right),
  }));

  return { movement: chosen.movement, cannons };
}

/** The AI every computer-controlled player uses, at the difficulty stored on them. */
export function createSimpleAI(): AIController {
  return { chooseActions: (state, playerId) => planAiActions(state, playerId) };
}
