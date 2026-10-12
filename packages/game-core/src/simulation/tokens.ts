import type {
  GameState,
  PlayerState,
  TokenGenerationConfig,
} from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { ActionQueue, MovementAction, TokenInventory } from '../domain/Action';
import {
  cloneInventory,
  emptyCannonQueue,
  emptyQueue,
  totalTokens,
} from '../domain/Action';
import {
  AUTO_TOKEN_ROTATION,
  CANNON_RELOAD_AMOUNT,
  CANNON_RELOAD_INTERVAL_TURNS,
  DEFAULT_TOKEN_ECONOMY,
  type TokenEconomy,
} from '../config/gameRules';
import { getShipType, tokenEconomyOf } from '../config/shipTypes';
import type { Ship } from '../domain/Ship';
import { blockingEntityAt } from './selectors';

export interface TokenSelection {
  readonly token: MovementAction;
  readonly tokenGeneration: TokenGenerationConfig;
}

/**
 * Chooses the next movement token to produce. When AUTO is on it walks the
 * deterministic rotation; otherwise it uses the player's requested token.
 * Swap this out later for crew/sailing-driven generation.
 */
export function selectNextToken(
  generation: TokenGenerationConfig,
  rotation: readonly MovementAction[] = AUTO_TOKEN_ROTATION,
): TokenSelection {
  if (!generation.auto) {
    return { token: generation.requested, tokenGeneration: generation };
  }

  const index = generation.rotationIndex % rotation.length;
  return {
    token: rotation[index],
    tokenGeneration: {
      ...generation,
      rotationIndex: generation.rotationIndex + 1,
    },
  };
}

const TOKEN_TYPES: readonly MovementAction[] = ['FORWARD', 'TURN_LEFT', 'TURN_RIGHT'];

/** What a ship's hold looks like, kept apart from `TokenInventory` so it can be reasoned about. */
type Hold = Record<MovementAction, number>;

/**
 * A token type's target share of a hold: how often it appears in the class's
 * token order (a sloop is half forward, a quarter each turn; a galleon is six
 * parts forward to one of each turn). A type that is not in the order has no
 * share.
 */
function targetShare(rotation: readonly MovementAction[], type: MovementAction): number {
  return rotation.length === 0
    ? 0
    : rotation.filter((entry) => entry === type).length / rotation.length;
}

/** How much of a type is held compared with its share. Higher means more than its fair part. */
function heldPerShare(held: number, share: number): number {
  return share > 0 ? held / share : Infinity;
}

const EPSILON = 1e-9;

export interface TokenProduction {
  readonly tokens: TokenInventory;
  readonly tokenGeneration: TokenGenerationConfig;
  /** Every token made, in order (a token that replaced another at the cap counts). */
  readonly made: readonly MovementAction[];
}

/**
 * Makes `count` new movement tokens for a hold.
 *
 *  - **Auto:** each token is the type the hold is most short of, measured
 *    against the class's own mix (see `targetShare`), so a ship never ends up
 *    with eleven forwards and no turns. When two types are equally short the
 *    class's token order decides, and the order moves on.
 *  - **Manual** (auto off): each token is the one the player asked for.
 *  - **At the cap** a new token does not get refused, so nobody has to spend
 *    tokens to make room: it replaces a token of the type held in the biggest
 *    surplus. In auto mode that only happens while the swap leaves the surplus
 *    type no shorter than the type it feeds (so a balanced hold stays as it is
 *    instead of swapping back and forth); in manual mode it always happens, as
 *    the player asked for that token.
 */
export function produceTokens(
  current: TokenInventory,
  generation: TokenGenerationConfig,
  economy: TokenEconomy,
  count: number,
): TokenProduction {
  const hold: Hold = { ...cloneInventory(current) };
  let next = generation;
  const made: MovementAction[] = [];

  for (let i = 0; i < count; i += 1) {
    const before = next;
    let token: MovementAction;
    if (next.auto) {
      const order = economy.rotation.length > 0 ? economy.rotation : AUTO_TOKEN_ROTATION;
      const candidates = TOKEN_TYPES.filter((type) => targetShare(order, type) > 0);
      const shortest = Math.min(
        ...candidates.map((type) => heldPerShare(hold[type], targetShare(order, type))),
      );
      const tied = new Set(
        candidates.filter(
          (type) =>
            Math.abs(heldPerShare(hold[type], targetShare(order, type)) - shortest) < EPSILON,
        ),
      );
      let step = 0;
      while (!tied.has(order[(next.rotationIndex + step) % order.length])) {
        step += 1;
      }
      token = order[(next.rotationIndex + step) % order.length];
      next = { ...next, rotationIndex: next.rotationIndex + step + 1 };
    } else {
      token = next.requested;
    }

    if (economy.cap === null || totalTokens(hold) < economy.cap) {
      hold[token] += 1;
      made.push(token);
      continue;
    }

    // Full: swap out a token of the type held in the biggest surplus.
    const order = economy.rotation.length > 0 ? economy.rotation : AUTO_TOKEN_ROTATION;
    const others = TOKEN_TYPES.filter((type) => type !== token && hold[type] > 0);
    if (others.length === 0) {
      next = before;
      continue;
    }
    const surplus = others.reduce((best, type) =>
      heldPerShare(hold[type], targetShare(order, type)) >
      heldPerShare(hold[best], targetShare(order, best))
        ? type
        : best,
    );
    const surplusAfter = heldPerShare(hold[surplus] - 1, targetShare(order, surplus));
    const tokenAfter = heldPerShare(hold[token] + 1, targetShare(order, token));
    if (!next.auto || surplusAfter + EPSILON >= tokenAfter) {
      hold[surplus] -= 1;
      hold[token] += 1;
      made.push(token);
    } else {
      next = before; // nothing made, so the order does not move on
    }
  }

  return {
    tokens: { FORWARD: hold.FORWARD, TURN_LEFT: hold.TURN_LEFT, TURN_RIGHT: hold.TURN_RIGHT },
    tokenGeneration: next,
    made,
  };
}

/**
 * Deducts the movement tokens a plan consumes. Never goes negative, so an
 * over-budget plan simply costs what the pool can cover. Used for AI players,
 * who spend their pool when a plan is locked in.
 */
export function spendMovementTokens(
  inventory: TokenInventory,
  movement: ActionQueue,
): TokenInventory {
  const next = cloneInventory(inventory);
  for (const action of movement) {
    if (action && next[action] > 0) {
      next[action] -= 1;
    }
  }
  return next;
}

/**
 * Cannonballs reload slower than movement tokens: a fixed amount is added every
 * N completed turns. There is no upper cap, so the pool keeps growing until it
 * is spent. Kept behind a function so the reload curve can be replaced later
 * without touching other layers.
 */
export function reloadedAmmo(
  current: number,
  completedTurn: number,
  amount: number = CANNON_RELOAD_AMOUNT,
): number {
  if (completedTurn % CANNON_RELOAD_INTERVAL_TURNS !== 0) {
    return current;
  }
  return current + amount;
}

export interface NextTurnResult {
  readonly state: GameState;
  /** The first movement token each player produced for the new turn. */
  readonly tokens: Readonly<Record<PlayerId, MovementAction>>;
  /** Every token each player produced (empty if their hold was full). */
  readonly produced: Readonly<Record<PlayerId, readonly MovementAction[]>>;
}

/**
 * Advances to the next turn: increments the turn counter, clears every player's
 * move and cannon queues, reloads cannonballs, and produces movement tokens
 * for each player from their own token-generation settings and economy: their
 * income, plus the rest bonus after a turn with no move, up to their cap.
 */
/**
 * Brings the ships due on `turn` onto the board with their full hull, at the
 * place and heading they were given. If a rock or another ship is in the way,
 * the ship tries again next turn.
 */
export function bringInArrivals(state: GameState, turn: number): Record<string, Ship> {
  const ships: Record<string, Ship> = { ...state.ships };
  for (const id of Object.keys(ships).sort()) {
    const ship = ships[id];
    if (ship.hp > 0 || ship.arrivesOnTurn === undefined || ship.arrivesOnTurn > turn) {
      continue;
    }
    if (blockingEntityAt({ ...state, ships }, ship.position, ship.id)) {
      ships[id] = { ...ship, arrivesOnTurn: turn + 1 };
      continue;
    }
    const { arrivesOnTurn: _arrived, ...arrived } = ship;
    ships[id] = { ...arrived, hp: ship.maxHp };
  }
  return ships;
}

export function beginNextTurn(state: GameState): NextTurnResult {
  const players: Record<PlayerId, PlayerState> = {};
  const first: Record<PlayerId, MovementAction> = {};
  const produced: Record<PlayerId, MovementAction[]> = {};

  for (const id of Object.keys(state.players)) {
    const player = state.players[id];
    const shipTypeId = state.ships[player.shipId]?.shipTypeId;
    const shipType = shipTypeId ? getShipType(shipTypeId) : null;
    const economy = shipType ? tokenEconomyOf(shipType) : DEFAULT_TOKEN_ECONOMY;
    const reload = shipType?.cannons?.reload ?? CANNON_RELOAD_AMOUNT;
    // A ship that has not arrived yet earns nothing while it waits.
    const waiting = state.ships[player.shipId]?.arrivesOnTurn !== undefined;
    const income = waiting
      ? 0
      : economy.perTurn + (player.restedLastTurn ? economy.restBonus : 0);
    const production = produceTokens(player.tokens, player.tokenGeneration, economy, income);
    const tokens = production.tokens;
    const made = [...production.made];
    const generation = production.tokenGeneration;
    produced[id] = made;
    if (made.length > 0) {
      first[id] = made[0];
    }

    players[id] = {
      ...player,
      tokens,
      ammo: reloadedAmmo(player.ammo, state.turn, reload),
      queue: emptyQueue(),
      cannonQueue: emptyCannonQueue(),
      tokenGeneration: generation,
      restedLastTurn: false,
      lockedIn: false,
    };
  }

  return {
    tokens: first,
    produced,
    state: {
      ...state,
      turn: state.turn + 1,
      status: 'planning',
      players,
      ships: state.objective?.kind === 'ambush' ? bringInArrivals(state, state.turn + 1) : state.ships,
    },
  };
}
