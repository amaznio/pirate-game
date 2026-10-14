import type { GameState } from '../domain/GameState';
import type { GameEvent } from '../domain/GameEvent';
import type { Position } from '../domain/Position';
import type { Direction } from '../domain/Direction';
import type { EntityId } from '../domain/Entity';
import type { Ship } from '../domain/Ship';
import type { LashSide, Monster, MonsterAttack, MonsterMap, MonsterPlan } from '../domain/Monster';
import { lashCell, monsterCells } from '../domain/Monster';
import { ACTIONS_PER_TURN, type ActionSlot, type MovementAction, MOVEMENT_ACTIONS } from '../domain/Action';
import { inBounds } from '../domain/Board';
import { getMonsterType, isMobileType, type MonsterType } from '../config/monsterTypes';
import { createRng } from '../ai/rng';
import type { MutableGameState } from './internal';
import { applyDamage } from './damage';
import { applyMovementPhase, resolveMovementOutcome, type MovementIntent } from './movement';
import { getLivingMonsters, getLivingShips } from './selectors';

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
    const action = plan.movement[phase];
    if (action) {
      pose = sailedPose(state, monster, pose, action);
    }
    const side = plan.lashes[phase];
    if (side) {
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
    const type = getMonsterType(monster.monsterTypeId);
    const rng = createRng(state.seed, state.turn, `monster:${id}`);
    const plan = isMobileType(type) ? planHunter(state, monster, type, rng) : planAmbusher(state, monster, type, rng);
    planned[id] = { ...monster, plan, attacks: forecast(state, monster, plan) };
  }
  return planned;
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
    const cell = lashCell(monster.heading, bowCell(monster), side);
    const target = getLivingShips(state).find((ship) => ship.position.x === cell.x && ship.position.y === cell.y);
    events.push({
      type: 'MONSTER_ATTACKED',
      monsterId: monster.id,
      side,
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
  }
  return events;
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
