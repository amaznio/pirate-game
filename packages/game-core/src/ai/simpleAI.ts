import type { GameState } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import type { PlayerId } from '../domain/Entity';
import type {
  ActionSlot,
  CannonSide,
  CannonSlot,
  MovementAction,
  TokenInventory,
} from '../domain/Action';
import {
  ACTIONS_PER_TURN,
  CANNON_SIDES,
  cloneInventory,
} from '../domain/Action';
import type { Ship } from '../domain/Ship';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import { leftBroadside, rightBroadside } from '../domain/Direction';
import { getHostiles, getShipByOwner } from '../simulation/selectors';
import { resolveMovementOutcome } from '../simulation/movement';
import { firstEntityAlongRay } from '../simulation/collision';
import { getWeaponType } from '../config/weaponTypes';
import type { AIController } from './AIController';

const CANDIDATES: readonly MovementAction[] = [
  'FORWARD',
  'TURN_LEFT',
  'TURN_RIGHT',
];

interface Choice {
  action: MovementAction | null;
  position: Position;
  heading: Direction;
  score: number;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** True when the given broadside could hit `targetId` from here. */
function canHitWithSide(
  state: GameState,
  me: Ship,
  position: Position,
  heading: Direction,
  side: CannonSide,
  targetId: string,
): boolean {
  const mount = me.weapons.find((weapon) => weapon.side === side);
  if (!mount) {
    return false;
  }
  const direction =
    side === 'left' ? leftBroadside(heading) : rightBroadside(heading);
  const weapon = getWeaponType(mount.weaponTypeId);
  const hit = firstEntityAlongRay(
    state,
    position,
    direction,
    weapon.range,
    me.id,
  );
  return Boolean(hit && hit.entity.id === targetId);
}

/** True when any broadside could hit `targetId` from here. */
function canBroadside(
  state: GameState,
  me: Ship,
  position: Position,
  heading: Direction,
  targetId: string,
): boolean {
  return CANNON_SIDES.some((side) =>
    canHitWithSide(state, me, position, heading, side, targetId),
  );
}

/**
 * Greedy one-phase-at-a-time planner, limited to movement tokens the enemy
 * actually holds. Prefers a move that lines up a broadside on the player,
 * otherwise closes distance while avoiding obstacles. Holds (no move) when no
 * token can afford a step. Deterministic via CANDIDATES order.
 */
function chooseBestAction(
  state: GameState,
  me: Ship,
  position: Position,
  heading: Direction,
  target: Ship,
  pool: TokenInventory,
): Choice {
  let best: Choice | null = null;

  for (const action of CANDIDATES) {
    if (pool[action] <= 0) {
      continue;
    }
    // Predict with the real movement rules, so partial and blocked moves are
    // understood exactly as the simulation will play them.
    const next = resolveMovementOutcome(
      state,
      me.id,
      position,
      heading,
      action,
    );
    const noEffect = !next.moved && next.heading === heading;

    let score = noEffect ? -1000 : 0;
    if (!noEffect) {
      if (canBroadside(state, me, next.position, next.heading, target.id)) {
        score += 100;
      }
      score -= manhattan(next.position, target.position);
    }

    const choice: Choice = {
      action,
      position: next.position,
      heading: next.heading,
      score,
    };
    if (!best || choice.score > best.score) {
      best = choice;
    }
  }

  return best ?? { action: null, position, heading, score: 0 };
}

/** The nearest living hostile ship (ties broken by id for determinism). */
function chooseTarget(state: GameState, me: Ship): Ship | undefined {
  return getHostiles(state, me).sort(
    (a, b) =>
      manhattan(me.position, a.position) - manhattan(me.position, b.position) ||
      a.id.localeCompare(b.id),
  )[0];
}

/** Plans one AI player's turn: movement limited to the tokens it holds. */
export function planAiActions(
  state: GameState,
  playerId: PlayerId,
): PlayerActions {
  const player = state.players[playerId];
  const me = getShipByOwner(state, playerId);
  const target = me ? chooseTarget(state, me) : undefined;
  if (!player || !me || !target || me.hp <= 0) {
    return { movement: [], cannons: [] };
  }

  let position = me.position;
  let heading = me.heading;
  let ammo = player.ammo;
  const pool = cloneInventory(player.tokens);

  const movement: ActionSlot[] = [];
  const cannons: CannonSlot[] = [];

  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    const choice = chooseBestAction(state, me, position, heading, target, pool);
    movement.push(choice.action);
    if (choice.action) {
      pool[choice.action] -= 1;
    }
    position = choice.position;
    heading = choice.heading;

    const cannon: { left: boolean; right: boolean } = {
      left: false,
      right: false,
    };
    for (const side of CANNON_SIDES) {
      if (
        ammo > 0 &&
        canHitWithSide(state, me, position, heading, side, target.id)
      ) {
        cannon[side] = true;
        ammo -= 1;
      }
    }
    cannons.push(cannon);
  }

  return { movement, cannons };
}

export function createSimpleAI(): AIController {
  return { chooseActions: planAiActions };
}
