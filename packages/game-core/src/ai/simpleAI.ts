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
import { isShip, mountsOnSide } from '../domain/Ship';
import { isMonster, lashCell, type Monster } from '../domain/Monster';
import { getMonsterType, isMobileType } from '../config/monsterTypes';
import { cellKey } from '../domain/Terrain';
import { heroTeams } from '../simulation/objectives';
import { onExitEdge } from '../simulation/escapes';
import { totalTokens } from '../domain/Action';
import { getShipType, tokenEconomyOf } from '../config/shipTypes';
import { blockingEntityAt, getHostiles, getLivingMonsters, getShipByOwner } from '../simulation/selectors';
import { bowCell } from '../simulation/monsters';
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

/** One cannon that would fire, and the enemy ship its shot would hit (if any). */
interface Shot {
  readonly victim: Ship | null;
  /** A sea monster the shot would hit (every ship is its enemy); never set together with a ship. */
  readonly monster?: Monster | null;
  readonly damage: number;
}

/** Whatever the AI is making for: an enemy ship, or, when there is none, a sea monster. */
interface Target {
  readonly id: string;
  readonly position: Position;
  readonly hp: number;
}

/** A pickup afloat, and what it is worth to this ship right now. */
interface Loot {
  readonly position: Position;
  readonly value: number;
}

/** Everything one planning run needs, with caches for the repeated lookups. */
interface Planning {
  readonly state: GameState;
  readonly me: Ship;
  readonly target: Target;
  readonly hostiles: readonly Ship[];
  readonly profile: AiProfile;
  readonly outcomes: Map<string, MovementOutcome>;
  readonly volleys: Map<string, readonly Shot[]>;
  readonly threats: Map<string, number>;
  /** The hull a sea monster is expected to take off a ship that ends a phase on a cell, by phase and cell. */
  readonly monsterRisks: Map<string, number>;
  /** The pickups worth having, and the index of the one on each cell (by `"x,y"`). */
  readonly loot: readonly Loot[];
  readonly lootAt: ReadonlyMap<string, number>;
  /**
   * In a salvage race, the score lost per cell between the ship and the
   * nearest pickup still afloat, so the ship heads for cargo as hard as it
   * would head for its target. Zero otherwise.
   */
  readonly salvageSlope: number;
  /** The merchant this ship is hunting (a hero team in a merchant match): hits on it count for more. */
  readonly preyId?: string;
  /** The edge a merchant is making for; its "goal" is reaching that edge, not a firing position. */
  readonly exit?: Direction;
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

/**
 * The cannons of one broadside that would fire from here, in firing order, each
 * with the enemy ship it would hit if any (cached). Every cannon on a side
 * fires along the same line from the ship's own cell, so they all meet the same
 * first thing in the way.
 */
function volleyOf(
  plan: Planning,
  position: Position,
  heading: Direction,
  side: CannonSide,
): readonly Shot[] {
  const key = `${position.x},${position.y},${heading},${side}`;
  const cached = plan.volleys.get(key);
  if (cached) {
    return cached;
  }
  const shots: Shot[] = [];
  const mounts = mountsOnSide(plan.me, side);
  if (mounts.length > 0) {
    const weapon = getWeaponType(mounts[0].weaponTypeId);
    const hit = firstEntityAlongRay(
      plan.state,
      position,
      broadsideDirection(heading, side),
      weapon.range,
      plan.me.id,
    );
    const victim =
      hit && isShip(hit.entity) && hit.entity.hp > 0 && hit.entity.teamId !== plan.me.teamId
        ? hit.entity
        : null;
    const monster = hit && isMonster(hit.entity) && hit.entity.hp > 0 ? hit.entity : null;
    for (const mount of mounts) {
      shots.push({
        victim,
        monster,
        damage: getWeaponType(mount.weaponTypeId).damage + (plan.me.bonusDamage ?? 0),
      });
    }
  }
  plan.volleys.set(key, shots);
  return shots;
}

/**
 * The hull a sea monster is expected to take off a ship that ends this phase on
 * this cell. When the match warns, the AI reads the same forecast the players
 * are shown. Otherwise it knows only what a player could guess: the cells a
 * monster can strike, and how far a sailing one can get, each weighted by how
 * often it strikes.
 */
function monsterLoss(plan: Planning, position: Position, phase: number): number {
  const key = `${phase},${position.x},${position.y}`;
  const cached = plan.monsterRisks.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let loss = 0;
  for (const monster of getLivingMonsters(plan.state)) {
    const type = getMonsterType(monster.monsterTypeId);
    if (plan.state.monsterWarnings) {
      for (const attack of monster.attacks) {
        if (attack.phase === phase && positionsEqual(attack.cell, position)) {
          loss += type.lashDamage;
        }
      }
      continue;
    }
    const share = type.lashesPerTurn / ACTIONS_PER_TURN;
    if (isMobileType(type)) {
      // It may sail up to this many cells and strike what is beside it.
      if (manhattan(position, monster.position) <= type.movesPerTurn + 1) {
        loss += share * type.lashDamage * 0.5;
      }
    } else {
      const bow = bowCell(monster);
      if (type.lashSides.some((side) => positionsEqual(lashCell(monster.heading, bow, side), position))) {
        loss += share * type.lashDamage;
      }
    }
  }
  plan.monsterRisks.set(key, loss);
  return loss;
}

/** How many enemy cannons (as they are now) would cover this cell. */
function threatsAt(plan: Planning, position: Position): number {
  const key = `${position.x},${position.y}`;
  const cached = plan.threats.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let count = 0;
  for (const enemy of plan.hostiles) {
    // Each cannon is a threat of its own (they stack their damage along one line).
    for (const mount of enemy.weapons) {
      const direction = broadsideDirection(enemy.heading, mount.side);
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
        const atGoal = plan.exit
          ? onExitEdge(board, plan.exit, position)
          : CANNON_SIDES.some((side) =>
              volleyOf(plan, position, heading, side).some(
                (shot) => (shot.victim?.id ?? shot.monster?.id) === plan.target.id,
              ),
            );
        if (atGoal) {
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
 * What a pickup is worth to this ship now: the profile's loot weight, scaled
 * by how much the ship needs what is in it. A full hull wants no plank, and a
 * full hold no crate.
 */
function lootValue(
  state: GameState,
  me: Ship,
  playerId: PlayerId,
  kind: string,
  weight: number,
  value = 1,
): number {
  const player = state.players[playerId];
  if (!player || weight <= 0) {
    return 0;
  }
  if (state.objective?.kind === 'salvage') {
    return weight; // in a race every pickup counts the same, full hold or not
  }
  switch (kind) {
    case 'chest':
      return weight * value; // treasure is what a hunt is for
    case 'barrel':
      return weight * (player.ammo <= 1 ? 2 : player.ammo <= 3 ? 1.2 : player.ammo <= 6 ? 0.6 : 0.3);
    case 'plank': {
      const missing = me.maxHp - me.hp;
      return missing <= 0 ? 0 : weight * (missing >= 2 ? 1.6 : 1);
    }
    case 'crate': {
      const economy = tokenEconomyOf(getShipType(me.shipTypeId));
      const held = totalTokens(player.tokens);
      if (economy.cap !== null && held >= economy.cap) {
        return 0;
      }
      return weight * (held <= 2 ? 1.6 : held <= 5 ? 1 : 0.5);
    }
    default:
      return 0;
  }
}

/** How far away a pickup still draws the ship, in cells. */
const LOOT_PULL_RANGE = 10;
/** A salvage race pulls with this share of the pickup's value per cell. */
const SALVAGE_SLOPE = 0.12;
/** What reaching its exit is worth to a merchant: more than anything else on the board. */
const EXIT_BONUS = 200;
/** How much more a hit on the merchant is worth to the hero team than any other hit. */
const PREY_WEIGHT = 3;

/**
 * Landing on a pickup collects it (the best score a plan can have from loot).
 * Further off, the nearest one still pulls a little, so the ship heads for
 * loot it cannot yet reach, but never as hard as it heads for its target.
 */
function lootPull(plan: Planning, position: Position, taken: number): number {
  if (plan.salvageSlope > 0) {
    let nearest = Infinity;
    plan.loot.forEach((loot, index) => {
      if (!(taken & (1 << index))) {
        nearest = Math.min(nearest, manhattan(position, loot.position));
      }
    });
    return nearest === Infinity ? 0 : -plan.salvageSlope * nearest;
  }
  let best = 0;
  plan.loot.forEach((loot, index) => {
    if (taken & (1 << index)) {
      return;
    }
    const reach = Math.max(0, 1 - manhattan(position, loot.position) / LOOT_PULL_RANGE);
    best = Math.max(best, 0.5 * loot.value * reach);
  });
  return best;
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
  taken: number,
  out: Candidate[],
): void {
  if (phase === ACTIONS_PER_TURN) {
    out.push({
      movement: [...movement],
      cannons: cannons.map((slot) => ({ ...slot })),
      score:
        shotScore -
        plan.profile.tokenCost * tokensUsed +
        placement(plan, position, heading) +
        lootPull(plan, position, taken),
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

    // Fire the cannons of every side that lines up a hit: as many as it has
    // cannonballs for, and no more than it takes to sink the ship in the way.
    let ammo = ammoLeft;
    let value = 0;
    const fires = { left: 0, right: 0 };
    for (const side of CANNON_SIDES) {
      if (ammo <= 0) {
        break;
      }
      const shots = volleyOf(plan, nextPosition, nextHeading, side);
      const victim = shots[0]?.victim ?? shots[0]?.monster;
      if (!victim) {
        continue;
      }
      const used = Math.min(shots.length, ammo, victim.hp);
      fires[side] = used;
      let dealt = 0;
      // Hits on the merchant are what the match is about.
      // A monster that is not what it is hunting is worth less than a ship.
      const weight =
        victim.id === plan.preyId
          ? PREY_WEIGHT
          : shots[0].monster && victim.id !== plan.target.id
            ? plan.profile.monsterHitWeight
            : 1;
      for (const shot of shots.slice(0, used)) {
        ammo -= 1;
        const struck = shot.victim ?? shot.monster;
        if (struck) {
          // The cannons stack: the one that finishes the ship earns the kill bonus.
          const before = dealt;
          dealt += shot.damage;
          value +=
            weight *
            (plan.profile.hitValue +
              (before < struck.hp && dealt >= struck.hp ? plan.profile.killBonus : 0));
        }
      }
    }

    // A sea monster may strike the cell this phase ends on.
    if (plan.profile.monsterFear > 0) {
      value -= plan.profile.monsterFear * monsterLoss(plan, nextPosition, phase);
    }

    // A merchant that ends a phase on its exit edge is away: nothing is worth more.
    if (plan.exit && onExitEdge(plan.state.board, plan.exit, nextPosition)) {
      value += EXIT_BONUS;
    }

    // Ending the phase on a pickup that is still afloat collects it.
    let nextTaken = taken;
    const found = plan.lootAt.get(cellKey(nextPosition));
    if (found !== undefined && !(taken & (1 << found))) {
      nextTaken |= 1 << found;
      value += plan.loot[found].value;
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
      nextTaken,
      out,
    );
    movement.pop();
    cannons.pop();
    if (option !== null) {
      pool[option] += 1;
    }
  }
}

/** The pickups this ship cares about, in a fixed order, with where each is. */
function lootFor(
  state: GameState,
  me: Ship,
  playerId: PlayerId,
  weight: number,
  only?: ReadonlySet<string>,
): { loot: Loot[]; lootAt: Map<string, number> } {
  const loot: Loot[] = [];
  const lootAt = new Map<string, number>();
  for (const key of Object.keys(state.pickups ?? {}).sort()) {
    if (only && !only.has(key)) {
      continue;
    }
    const value = lootValue(state, me, playerId, state.pickups![key].kind, weight, state.pickups![key].value);
    if (value > 0 && loot.length < 30) {
      const [x, y] = key.split(',').map(Number);
      lootAt.set(key, loot.length);
      loot.push({ position: { x, y }, value });
    }
  }
  return { loot, lootAt };
}

/** How many pickups a blocker in a salvage match keeps its eye on. */
const GUARDED_PICKUPS = 2;

/**
 * In a salvage match the opposition collects nothing; it tries to stop the hero
 * team hauling. It sails for the pickups lying nearest the hero ships (where the
 * ships are is public, their plans are not) and sits on them: a ship on a
 * pickup's cell keeps the hero off it. Undefined for the hero team and outside salvage.
 */
function guardedPickups(state: GameState, me: Ship): ReadonlySet<string> | undefined {
  if (state.objective?.kind !== 'salvage' || heroTeams(state).has(me.teamId)) {
    return undefined;
  }
  const heroes = heroTeams(state);
  const hostile = getHostiles(state, me).filter((ship) => heroes.has(ship.teamId));
  const nearHero = (key: string): number => {
    const [x, y] = key.split(',').map(Number);
    return Math.min(...hostile.map((ship) => manhattan(ship.position, { x, y })));
  };
  const keys = Object.keys(state.pickups ?? {})
    .sort()
    .sort((a, b) => nearHero(a) - nearHero(b));
  return new Set(hostile.length > 0 ? keys.slice(0, GUARDED_PICKUPS) : []);
}

/** The merchant a hero-team ship should be hunting, while it is afloat. */
function merchantPrey(state: GameState, me: Ship): Ship | undefined {
  const objective = state.objective;
  if (objective?.kind !== 'merchant' || !objective.shipId || objective.shipId === me.id) {
    return undefined;
  }
  const merchant = state.ships[objective.shipId];
  return merchant && merchant.hp > 0 && heroTeams(state).has(me.teamId) ? merchant : undefined;
}

/** The edge this ship is making for, when it is the merchant of a merchant match. */
function merchantExit(state: GameState, me: Ship): Direction | undefined {
  const objective = state.objective;
  return objective?.kind === 'merchant' && objective.shipId === me.id ? objective.exit : undefined;
}

/**
 * How a merchant sails: it wants its exit above everything, keeps out of the
 * hero's lines of fire where it can, never wastes a thought on shooting (it has
 * no guns) and never makes a mistake, whatever difficulty the match is set to.
 */
function merchantProfile(profile: AiProfile): AiProfile {
  return {
    ...profile,
    hitValue: 0,
    killBonus: 0,
    approachWeight: 10,
    distanceWeight: 0,
    tokenCost: 0,
    dangerWeight: 20,
    edgeWeight: 0,
    lootWeight: 0,
    salvageWeight: 0,
    maxMoves: 4,
    mistakeRate: 0,
    mistakePool: 1,
    fireChance: 0,
  };
}

/**
 * In a survive match the hero team is not out to win the fight, only to still
 * be afloat when time runs out: it stops closing in on its target, keeps out of
 * enemy lines of fire and off the edge, and still takes the shots it is given.
 * Everyone else plays as usual (they are the hunters).
 */
function forObjective(profile: AiProfile, state: GameState, me: Ship): AiProfile {
  if (state.objective?.kind !== 'survive' || !heroTeams(state).has(me.teamId)) {
    return profile;
  }
  return {
    ...profile,
    approachWeight: profile.approachWeight * 0.25,
    distanceWeight: 0,
    dangerWeight: Math.max(profile.dangerWeight, SURVIVE_DANGER),
    edgeWeight: Math.max(profile.edgeWeight, 5),
  };
}

const SURVIVE_DANGER = 25;

/**
 * The nearest living hostile ship (ties broken by id for determinism) or, when no
 * enemy ship is left, the nearest sea monster: the AI of a hunt has nobody else to fight.
 */
function chooseTarget(state: GameState, me: Ship): Target | undefined {
  const byDistance = (a: Target, b: Target): number =>
    manhattan(me.position, a.position) - manhattan(me.position, b.position) || a.id.localeCompare(b.id);
  return getHostiles(state, me).sort(byDistance)[0] ?? getLivingMonsters(state).sort(byDistance)[0];
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
  const prey = me ? merchantPrey(state, me) : undefined;
  const target = prey ?? (me ? chooseTarget(state, me) : undefined);
  if (!player || !me || !target || me.hp <= 0) {
    return { movement: [], cannons: [] };
  }

  const exit = merchantExit(state, me);
  const profile = exit
    ? merchantProfile(profileFor(difficulty ?? player.aiDifficulty))
    : forObjective(profileFor(difficulty ?? player.aiDifficulty), state, me);

  const guarded = guardedPickups(state, me);
  const plan: Planning = {
    state,
    me,
    target,
    hostiles: getHostiles(state, me),
    profile,
    outcomes: new Map(),
    volleys: new Map(),
    threats: new Map(),
    monsterRisks: new Map(),
    ...lootFor(
      state,
      me,
      playerId,
      state.objective?.kind === 'salvage' ? profile.salvageWeight : profile.lootWeight,
      guarded,
    ),
    salvageSlope: state.objective?.kind === 'salvage' ? SALVAGE_SLOPE * profile.salvageWeight : 0,
    ...(exit ? { exit } : {}),
    ...(prey ? { preyId: prey.id } : {}),
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
  const keepShot = (wanted: number): number =>
    wanted > 0 && (profile.fireChance >= 1 || rng() < profile.fireChance) ? wanted : 0;
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
