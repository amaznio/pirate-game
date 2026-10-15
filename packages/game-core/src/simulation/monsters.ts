import type { GameState } from '../domain/GameState';
import type { GameEvent } from '../domain/GameEvent';
import type { Position } from '../domain/Position';
import type { Direction } from '../domain/Direction';
import type { EntityId } from '../domain/Entity';
import type { Ship } from '../domain/Ship';
import type { LashSide, Monster, MonsterAttack, MonsterMap, MonsterPlan } from '../domain/Monster';
import { lashCell, monsterCells } from '../domain/Monster';
import { DIRECTIONS, vectorFor } from '../domain/Direction';
import { translate } from '../domain/Position';
import { ACTIONS_PER_TURN, type ActionSlot, type MovementAction, MOVEMENT_ACTIONS } from '../domain/Action';
import { inBounds } from '../domain/Board';
import { getMonsterType, isMobileType, type MonsterType } from '../config/monsterTypes';
import { createRng } from '../ai/rng';
import type { MutableGameState } from './internal';
import { applyDamage } from './damage';
import { applyMovementPhase, resolveMovementOutcome, type MovementIntent } from './movement';
import { getLivingMonsters, getLivingShips, monsterAt, obstacleAt, solidMonsterAt } from './selectors';
import { cellKey } from '../domain/Terrain';
import type { PickupMap } from '../domain/Pickup';

/** The monster's bow cell: the last cell of its body, where its arms are. */
export function bowCell(monster: Pick<Monster, 'position' | 'heading' | 'monsterTypeId'>): Position {
  const cells = monsterCells(monster, getMonsterType(monster.monsterTypeId).length);
  return cells[cells.length - 1];
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearestShip(ships: readonly { position: Position }[], cell: Position): number {
  if (ships.length === 0) {
    return 0;
  }
  return Math.min(...ships.map((ship) => distance(ship.position, cell)));
}

/** A mobile monster as the movement rules see it: a ship with no guns and no crew. */
function asShip(monster: Monster): Ship {
  return {
    id: monster.id,
    kind: 'ship',
    ownerId: monster.id,
    teamId: 'monsters',
    shipTypeId: monster.monsterTypeId,
    heading: monster.heading,
    hp: monster.hp,
    maxHp: monster.maxHp,
    position: monster.position,
    weapons: [],
  };
}

/**
 * The state with every living monster that sails added as a ship. Wind,
 * whirlpools, blocking and conflicts all work on ships, so a sailing monster
 * simply is one for as long as the board moves things about.
 */
function withSailors<T extends GameState>(state: T): T {
  const sailors = getLivingMonsters(state).filter((monster) => isMobileType(getMonsterType(monster.monsterTypeId)));
  if (sailors.length === 0) {
    return state;
  }
  const ships: Record<EntityId, Ship> = { ...state.ships };
  for (const monster of sailors) {
    ships[monster.id] = asShip(monster);
  }
  return { ...state, ships };
}

interface Pose {
  readonly position: Position;
  readonly heading: Direction;
}

/** Where the plan's moves would take a monster if every ship stood still. */
function sailedPose(state: GameState, monster: Monster, pose: Pose, action: MovementAction): Pose {
  const hypothetical = withSailors(state);
  const outcome = resolveMovementOutcome(hypothetical, monster.id, pose.position, pose.heading, action);
  return { position: outcome.position, heading: outcome.heading };
}

/** The sides this monster can lash, as cells from a pose, kept to the board. */
function reachFrom(state: GameState, type: MonsterType, monster: Monster, pose: Pose) {
  const bow = bowCell({ position: pose.position, heading: pose.heading, monsterTypeId: monster.monsterTypeId });
  return type.lashSides
    .map((side) => ({ side, cell: lashCell(pose.heading, bow, side) }))
    .filter(({ cell }) => inBounds(state.board, cell));
}

/** A hunter's turn: sail toward the nearest ship, and lash whenever one is close. */
function planHunter(state: GameState, monster: Monster, type: MonsterType, rng: () => number): MonsterPlan {
  const ships = getLivingShips(state);
  const movement: ActionSlot[] = Array.from({ length: ACTIONS_PER_TURN }, () => null);
  const lashes: (LashSide | null)[] = Array.from({ length: ACTIONS_PER_TURN }, () => null);

  // Which phases it sails in: a shuffled pick of the turn's phases.
  const phases = Array.from({ length: ACTIONS_PER_TURN }, (_, phase) => phase);
  for (let i = phases.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [phases[i], phases[j]] = [phases[j], phases[i]];
  }
  const sailing = new Set(phases.slice(0, Math.min(type.movesPerTurn, ACTIONS_PER_TURN)));

  let pose: Pose = { position: monster.position, heading: monster.heading };
  let lashing = 0;
  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    if (sailing.has(phase)) {
      // How well a pose faces the hunt: close to a ship, and with one near the cell ahead.
      const worth = (at: Pose): number =>
        nearestShip(ships, at.position) + 0.5 * nearestShip(ships, lashCell(at.heading, at.position, 'front'));
      const same = (a: Pose, b: Pose): boolean =>
        a.position.x === b.position.x && a.position.y === b.position.y && a.heading === b.heading;
      const here = worth(pose);

      // Each move, as the movement rules would play it. A turn whose way is blocked still
      // turns the ship on the spot, which is how a hunter gets round a rock.
      const options = MOVEMENT_ACTIONS.map((action) => ({ action, pose: sailedPose(state, monster, pose, action) }))
        .filter((option) => !same(option.pose, pose))
        .map((option) => ({ ...option, score: worth(option.pose) }));
      const forward = options.find((option) => option.action === 'FORWARD');
      const turns = options.filter((option) => option.action !== 'FORWARD');
      const facingAway =
        nearestShip(ships, lashCell(pose.heading, pose.position, 'front')) > nearestShip(ships, pose.position);

      let choice: { action: MovementAction; pose: Pose } | null = null;
      if (!forward || facingAway) {
        // Blocked ahead, or pointing the wrong way: sailing on does no good, so turn.
        choice = [...turns].sort((a, b) => a.score - b.score)[0] ?? null;
      } else {
        const improving = options.filter((option) => option.score < here).sort((a, b) => a.score - b.score)[0];
        choice = improving ?? forward;
      }
      // Now and then it swings the other way, so two obstacles cannot hold it in a loop.
      if (choice && turns.length > 0 && rng() < 0.15) {
        choice = turns[Math.floor(rng() * turns.length)];
      }
      if (choice) {
        movement[phase] = choice.action;
        pose = choice.pose;
      }
    }
    // Lash when something is in reach after this phase's moving.
    if (lashing < type.lashesPerTurn) {
      const target = reachFrom(state, type, monster, pose)
        .map((reach) => ({ ...reach, gap: nearestShip(ships, reach.cell) }))
        .sort((a, b) => a.gap - b.gap)[0];
      if (target && target.gap <= 1) {
        lashes[phase] = target.side;
        lashing += 1;
      }
    }
  }
  return { movement, lashes };
}

/**
 * How many steps each free cell is from the nearest ship, going round rocks and
 * the monsters that never move. A monster with no front follows it downhill, so
 * a rock between it and a ship sends it round, not into a standstill.
 */
function distanceField(state: GameState, ships: readonly { position: Position }[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Position[] = [];
  for (const ship of ships) {
    dist.set(`${ship.position.x},${ship.position.y}`, 0);
    queue.push(ship.position);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const here = queue[head];
    const next = (dist.get(`${here.x},${here.y}`) ?? 0) + 1;
    for (const dir of DIRECTIONS) {
      const cell = translate(here, vectorFor(dir));
      const key = `${cell.x},${cell.y}`;
      if (dist.has(key) || !inBounds(state.board, cell) || obstacleAt(state, cell) || solidMonsterAt(state, cell)) {
        continue;
      }
      dist.set(key, next);
      queue.push(cell);
    }
  }
  return dist;
}

/** A monster with no front closes on the nearest ship by stepping straight at it, and lashes any ship beside it. */
function planStalker(state: GameState, monster: Monster, type: MonsterType, rng: () => number): MonsterPlan {
  const ships = getLivingShips(state);
  const nulls = <T,>(): (T | null)[] => Array.from({ length: ACTIONS_PER_TURN }, () => null);
  const movement: ActionSlot[] = nulls<MovementAction>();
  const lashes: (LashSide | null)[] = nulls<LashSide>();
  const steps: (Direction | null)[] = nulls<Direction>();
  const aims: (Direction | null)[] = nulls<Direction>();

  const phases = Array.from({ length: ACTIONS_PER_TURN }, (_, phase) => phase);
  for (let i = phases.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [phases[i], phases[j]] = [phases[j], phases[i]];
  }
  const sailing = new Set(phases.slice(0, Math.min(type.movesPerTurn, ACTIONS_PER_TURN)));

  const field = distanceField(state, ships);
  const gapAt = (cell: Position): number => field.get(`${cell.x},${cell.y}`) ?? Infinity;

  let position = monster.position;
  let lashing = 0;
  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    if (sailing.has(phase)) {
      const here = gapAt(position);
      // Where each way would carry it (a blocked way carries it nowhere), in a shuffled order so ties vary.
      const ways = [...DIRECTIONS]
        .sort(() => rng() - 0.5)
        .map((dir) => ({ dir, to: sailedPose(state, monster, { position, heading: dir }, 'FORWARD').position }))
        .filter(({ to }) => to.x !== position.x || to.y !== position.y)
        .map((way) => ({ ...way, gap: gapAt(way.to) }))
        .sort((a, b) => a.gap - b.gap);
      // Already beside a ship, it stays and strikes; otherwise it takes the way that gets it closest.
      if (here > 1 && ways[0] && ways[0].gap < here) {
        steps[phase] = ways[0].dir;
        position = ways[0].to;
      }
    }
    if (lashing < type.lashesPerTurn) {
      const prey = DIRECTIONS.find((dir) => {
        const cell = translate(position, vectorFor(dir));
        return ships.some((ship) => ship.position.x === cell.x && ship.position.y === cell.y);
      });
      if (prey) {
        lashes[phase] = 'front';
        aims[phase] = prey;
        lashing += 1;
      }
    }
  }
  return { movement, lashes, steps, aims };
}

/** A stationary monster's turn: a few lashes at the cells nearest a ship, spread out. */
function planAmbusher(state: GameState, monster: Monster, type: MonsterType, rng: () => number): MonsterPlan {
  const ships = getLivingShips(state);
  const movement: ActionSlot[] = Array.from({ length: ACTIONS_PER_TURN }, () => null);
  const lashes: (LashSide | null)[] = Array.from({ length: ACTIONS_PER_TURN }, () => null);
  const options = reachFrom(state, type, monster, { position: monster.position, heading: monster.heading });

  const phases = Array.from({ length: ACTIONS_PER_TURN }, (_, phase) => phase);
  for (let i = phases.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [phases[i], phases[j]] = [phases[j], phases[i]];
  }
  const chosen = phases.slice(0, Math.min(type.lashesPerTurn, ACTIONS_PER_TURN)).sort((a, b) => a - b);

  const picked: { cell: Position }[] = [];
  for (const phase of chosen) {
    if (options.length === 0) {
      break;
    }
    // Usually the cell closest to a ship, though a cell already marked this turn counts as
    // farther (so the lashes spread out); sometimes any cell it can reach.
    const taken = (cell: Position) => picked.filter((p) => p.cell.x === cell.x && p.cell.y === cell.y).length;
    const nearest = [...options].sort(
      (a, b) => nearestShip(ships, a.cell) + 3 * taken(a.cell) - (nearestShip(ships, b.cell) + 3 * taken(b.cell)),
    )[0];
    const pick = rng() < 0.3 ? options[Math.floor(rng() * options.length)] : nearest;
    lashes[phase] = pick.side;
    picked.push({ cell: pick.cell });
  }
  return { movement, lashes };
}

/** Where each of a plan's lashes should land, if nothing gets in the monster's way. */
function forecast(state: GameState, monster: Monster, plan: MonsterPlan): MonsterAttack[] {
  const attacks: MonsterAttack[] = [];
  let pose: Pose = { position: monster.position, heading: monster.heading };
  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    const step = plan.steps?.[phase];
    const action = plan.movement[phase];
    if (step) {
      pose = sailedPose(state, monster, { position: pose.position, heading: step }, 'FORWARD');
    } else if (action) {
      pose = sailedPose(state, monster, pose, action);
    }
    const aim = plan.aims?.[phase];
    const side = plan.lashes[phase];
    if (side && aim) {
      attacks.push({ phase, cell: translate(pose.position, vectorFor(aim)), side });
    } else if (side) {
      const bow = bowCell({ position: pose.position, heading: pose.heading, monsterTypeId: monster.monsterTypeId });
      attacks.push({ phase, cell: lashCell(pose.heading, bow, side), side });
    }
  }
  return attacks;
}

/**
 * Plans what each living monster will do in turn `state.turn`, in the same
 * four-phase shape as a ship's plan: the moves it will sail (a one-cell monster
 * only) and the lashes it will make. Pure and deterministic from the seed and
 * the turn. The plan stays hidden; its forecast is shown only when the match warns.
 */
export function planMonsterTurn(state: GameState): MonsterMap | undefined {
  if (!state.monsters) {
    return undefined;
  }
  const planned: Record<EntityId, Monster> = {};
  for (const id of Object.keys(state.monsters).sort()) {
    const monster = state.monsters[id];
    if (monster.hp <= 0) {
      const { plan: _plan, ...rest } = monster;
      planned[id] = { ...rest, attacks: [] };
      continue;
    }
    if (monster.surfacedOnTurn === state.turn) {
      // It has only just risen: it waits this turn, so everyone sees it before it acts.
      const { plan: _fresh, ...rest } = monster;
      planned[id] = { ...rest, attacks: [] };
      continue;
    }
    const type = getMonsterType(monster.monsterTypeId);
    const rng = createRng(state.seed, state.turn, `monster:${id}`);
    const plan = type.omnidirectional
      ? planStalker(state, monster, type, rng)
      : isMobileType(type)
        ? planHunter(state, monster, type, rng)
        : planAmbusher(state, monster, type, rng);
    planned[id] = { ...monster, plan, attacks: forecast(state, monster, plan) };
  }
  return planned;
}

const chebyshev = (a: Position, b: Position): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** The way to face from a cell to look at a ship: along the longer gap. */
function headingToward(from: Position, to: Position | undefined): Direction {
  if (!to) {
    return 'SOUTH';
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'EAST' : 'WEST') : dy > 0 ? 'SOUTH' : 'NORTH';
}

/**
 * Lets the monsters that surface others do it, at the start of turn
 * `state.turn`: on their timer, and each time they have lost enough hull to
 * cross one of their thresholds. New ones rise on free water a few cells from
 * the body, never beside a ship, face the nearest ship, and wait out the turn
 * they rise. Pure and deterministic from the seed and the turn.
 */
export function spawnSummons(state: GameState): MonsterMap | undefined {
  if (!state.monsters) {
    return undefined;
  }
  const monsters: Record<EntityId, Monster> = { ...state.monsters };
  const ships = getLivingShips(state);

  for (const id of Object.keys(state.monsters).sort()) {
    const parent = monsters[id];
    const type = getMonsterType(parent.monsterTypeId);
    const rule = type.spawns;
    if (!rule || parent.hp <= 0) {
      continue;
    }

    let want = 0;
    if (rule.everyTurns > 0 && state.turn % rule.everyTurns === 0) {
      want += rule.timerCount;
    }
    const crossed = rule.hpThresholds.filter((share) => parent.hp / parent.maxHp <= share).length;
    const answered = parent.spawnWaves ?? 0;
    if (crossed > answered) {
      want += rule.thresholdCount * (crossed - answered);
      monsters[id] = { ...parent, spawnWaves: crossed };
    }
    const afloat = Object.values(monsters).filter((m) => m.parentId === id && m.hp > 0).length;
    want = Math.min(want, rule.max - afloat);
    if (want <= 0) {
      continue;
    }

    // Free water in reach of the body, kept clear of ships, rocks, wind and other monsters.
    const body = monsterCells(parent, type.length);
    const candidates: Position[] = [];
    for (let y = 0; y < state.board.height; y += 1) {
      for (let x = 0; x < state.board.width; x += 1) {
        const cell = { x, y };
        const gap = Math.min(...body.map((part) => chebyshev(part, cell)));
        if (
          gap >= rule.reach[0] &&
          gap <= rule.reach[1] &&
          !obstacleAt(state, cell) &&
          !state.terrain[cellKey(cell)] &&
          !monsterAt({ monsters }, cell) &&
          ships.every((ship) => chebyshev(ship.position, cell) >= 2)
        ) {
          candidates.push(cell);
        }
      }
    }

    const rng = createRng(state.seed, state.turn, `spawn:${id}`);
    for (let n = 0; n < want && candidates.length > 0; n += 1) {
      const cell = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
      const nearest = [...ships].sort((a, b) => distance(a.position, cell) - distance(b.position, cell))[0];
      const summonType = getMonsterType(rule.typeId);
      const summonId = `${rule.typeId}-${id}-${state.turn}-${n + 1}`;
      monsters[summonId] = {
        id: summonId,
        kind: 'monster',
        monsterTypeId: rule.typeId,
        position: cell,
        heading: headingToward(cell, nearest?.position),
        hp: summonType.maxHp,
        maxHp: summonType.maxHp,
        attacks: [],
        parentId: id,
        surfacedOnTurn: state.turn,
      };
    }
  }
  return monsters;
}

/**
 * The monsters as they stand when turn `state.turn + 1` opens: anything that
 * is due to surface has surfaced, and every monster has planned its turn.
 */
export function monstersForNextTurn(state: GameState): MonsterMap | undefined {
  const next: GameState = { ...state, turn: state.turn + 1 };
  const risen = spawnSummons(next);
  return planMonsterTurn(risen ? { ...next, monsters: risen } : next);
}

/**
 * Plays one phase of movement for the ships and for the monsters that sail,
 * all at once, under the rules ships already follow. A sailing monster is a ship
 * for the length of the call, then goes back to being a monster; what happened to
 * it comes out as MONSTER_MOVED.
 */
export function applyMovementWithMonsters(
  state: MutableGameState,
  shipIntents: readonly MovementIntent[],
  phase: number,
): GameEvent[] {
  const sailors = getLivingMonsters(state).filter((monster) => isMobileType(getMonsterType(monster.monsterTypeId)));
  if (sailors.length === 0) {
    return applyMovementPhase(state, shipIntents, phase);
  }

  const intents: MovementIntent[] = [...shipIntents];
  for (const monster of sailors) {
    const step = monster.plan?.steps?.[phase];
    if (step) {
      // No front: it takes the way it means to go as its heading for the phase, and sails forward.
      state.ships[monster.id] = { ...asShip(monster), heading: step };
      intents.push({ shipId: monster.id, action: 'FORWARD' });
      continue;
    }
    state.ships[monster.id] = asShip(monster);
    const action = monster.plan?.movement[phase];
    if (action) {
      intents.push({ shipId: monster.id, action });
    }
  }
  const raw = applyMovementPhase(state, intents, phase);

  const events: GameEvent[] = [];
  const sailorIds = new Set(sailors.map((monster) => monster.id));
  const moved = new Map<EntityId, { from: Position; fromHeading: Direction; cause: 'sail' | 'wind' | 'whirlpool' }>();
  for (const event of raw) {
    if (!('shipId' in event) || !sailorIds.has(event.shipId)) {
      events.push(event);
      continue;
    }
    // A sailing monster's moves are one MONSTER_MOVED per thing that moved it.
    const monster = state.monsters?.[event.shipId];
    if (!monster) {
      continue;
    }
    if (event.type === 'SHIP_MOVED') {
      moved.set(event.shipId, { from: event.from, fromHeading: monster.heading, cause: 'sail' });
      events.push({ type: 'MONSTER_MOVED', monsterId: event.shipId, from: event.from, to: event.to, heading: event.heading, cause: 'sail', phase });
    } else if (event.type === 'SHIP_PUSHED') {
      events.push({ type: 'MONSTER_MOVED', monsterId: event.shipId, from: event.from, to: event.to, heading: state.ships[event.shipId].heading, cause: 'wind', phase });
    } else if (event.type === 'SHIP_SPUN') {
      events.push({ type: 'MONSTER_MOVED', monsterId: event.shipId, from: event.from, to: event.to, heading: event.toHeading, cause: 'whirlpool', phase });
    }
  }

  // The pseudo-ships go back: the monster keeps where the board left it.
  const monsters = { ...state.monsters };
  for (const monster of sailors) {
    const ship = state.ships[monster.id];
    delete state.ships[monster.id];
    monsters[monster.id] = { ...monsters[monster.id], position: ship.position, heading: ship.heading };
  }
  state.monsters = monsters;
  return events;
}

/**
 * Lands the lashes planned for this phase, from where each monster really is
 * now: every ship in the cell it strikes is hit. A ship that has sailed out of
 * the cell is safe, and one that sailed in is not.
 */
export function resolveMonsterAttacks(state: MutableGameState, phase: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (!state.monsters) {
    return events;
  }
  for (const monster of getLivingMonsters(state)) {
    const side = monster.plan?.lashes[phase];
    if (!side) {
      continue;
    }
    const type = getMonsterType(monster.monsterTypeId);
    const aim = monster.plan?.aims?.[phase] ?? undefined;
    if (aim && monster.heading !== aim) {
      // It turns to face the blow, which is only for show: it has no front.
      state.monsters = { ...state.monsters, [monster.id]: { ...monster, heading: aim } };
    }
    const cell = aim ? translate(monster.position, vectorFor(aim)) : lashCell(monster.heading, bowCell(monster), side);
    const target = getLivingShips(state).find((ship) => ship.position.x === cell.x && ship.position.y === cell.y);
    events.push({
      type: 'MONSTER_ATTACKED',
      monsterId: monster.id,
      side,
      ...(aim ? { aim } : {}),
      cell: { ...cell },
      ...(target ? { targetId: target.id, damage: Math.min(type.lashDamage, target.hp) } : {}),
      phase,
    });
    if (target) {
      events.push(...applyDamage(state, target, type.lashDamage, phase));
    }
  }
  return events;
}

/** Hurts a monster; sinks it when its hull is gone. Returns the events. */
export function damageMonster(
  state: MutableGameState,
  monsterId: EntityId,
  amount: number,
  phase: number,
): GameEvent[] {
  const monster = state.monsters?.[monsterId];
  if (!monster || monster.hp <= 0) {
    return [];
  }
  const damage = Math.max(0, Math.min(amount, monster.hp));
  const hp = monster.hp - damage;
  state.monsters = { ...state.monsters, [monsterId]: { ...monster, hp } };
  const events: GameEvent[] = [
    { type: 'MONSTER_DAMAGED', monsterId, amount: damage, hp, maxHp: monster.maxHp, phase },
  ];
  if (hp <= 0) {
    events.push({ type: 'MONSTER_DESTROYED', monsterId, phase });
    dropLoot(state, monster);
    // What it surfaced goes down with it.
    for (const child of Object.values(state.monsters ?? {}).filter((m) => m.parentId === monsterId && m.hp > 0)) {
      state.monsters = { ...state.monsters, [child.id]: { ...child, hp: 0 } };
      events.push({ type: 'MONSTER_DESTROYED', monsterId: child.id, phase });
      dropLoot(state, child);
    }
  }
  return events;
}

/**
 * In a hunt, a monster that goes down leaves treasure chests on the water: on its own
 * cells first, then on the nearest free water round it, until it has left what its
 * kind drops. Free means no rock, wind, whirlpool, chest or other pickup, and no
 * monster still afloat. The same sinking always leaves the same chests.
 */
function dropLoot(state: MutableGameState, monster: Monster): void {
  const drop = getMonsterType(monster.monsterTypeId).drop;
  if (state.objective?.kind !== 'hunt' || !drop) {
    return;
  }
  const pickups: Record<string, PickupMap[string]> = { ...(state.pickups ?? {}) };
  const here = monsterCells(monster, getMonsterType(monster.monsterTypeId).length);
  const free = (cell: Position): boolean =>
    inBounds(state.board, cell) &&
    !pickups[cellKey(cell)] &&
    !obstacleAt(state, cell) &&
    !state.terrain[cellKey(cell)] &&
    !getLivingMonsters(state).some((other) =>
      monsterCells(other, getMonsterType(other.monsterTypeId).length).some((part) => part.x === cell.x && part.y === cell.y),
    );

  // Its own cells, then outward in rings (nearest first, in a fixed order).
  const rings: Position[] = [...here];
  for (let radius = 1; radius <= 4 && rings.length < here.length + drop.chests * 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const origin = monster.position;
        rings.push({ x: origin.x + dx, y: origin.y + dy });
      }
    }
  }
  let left = drop.chests;
  for (const cell of rings) {
    if (left <= 0) {
      break;
    }
    if (free(cell)) {
      pickups[cellKey(cell)] = { kind: 'chest', value: drop.value };
      left -= 1;
    }
  }
  state.pickups = pickups as PickupMap;
}

/** The turn is over: whatever the monsters planned is done, so the plan and the marks come off. */
export function clearMonsterAttacks(state: MutableGameState): void {
  if (!state.monsters) {
    return;
  }
  const cleared: Record<EntityId, Monster> = {};
  for (const id of Object.keys(state.monsters)) {
    const { plan: _plan, ...rest } = state.monsters[id];
    cleared[id] = { ...rest, attacks: [] };
  }
  state.monsters = cleared;
}
