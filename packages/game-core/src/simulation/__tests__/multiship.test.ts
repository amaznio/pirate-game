import { describe, expect, it } from 'vitest';
import type { ActionSlot, CannonSlot } from '../../domain/Action';
import type { Direction } from '../../domain/Direction';
import type { GameState, PlayerState } from '../../domain/GameState';
import type { PlayerActions } from '../../domain/TurnResult';
import type { Ship } from '../../domain/Ship';
import { emptyCannonQueue } from '../../domain/Action';
import { pos } from '../../domain/Position';
import { createGame, createShip, shipIdFor } from '../createGame';
import { resolveTurn } from '../resolveTurn';
import { rock } from './testUtils';

const WEAPONS = createGame().ships['player-ship'].weapons;

function makeShip(
  owner: string,
  team: string,
  x: number,
  y: number,
  heading: Direction,
  options: { hp?: number; armed?: boolean } = {},
): Ship {
  const ship = createShip(shipIdFor(owner), owner, team, pos(x, y), heading, 'sloop');
  return {
    ...ship,
    hp: options.hp ?? ship.hp,
    weapons: options.armed === false ? [] : WEAPONS,
  };
}

/** A board of arbitrary ships (one per player) with no default obstacles. */
function buildState(
  ships: Ship[],
  extra: Partial<GameState> = {},
): GameState {
  const base = createGame();
  const template = base.players.player;
  const players: Record<string, PlayerState> = {};
  const shipMap: Record<string, Ship> = {};
  for (const ship of ships) {
    shipMap[ship.id] = ship;
    players[ship.ownerId] = {
      ...template,
      id: ship.ownerId,
      teamId: ship.teamId,
      shipId: ship.id,
      controller: 'ai',
    };
  }
  return { ...base, obstacles: {}, ships: shipMap, players, ...extra };
}

function plan(
  movement: ActionSlot[] = [],
  cannons: CannonSlot[] = [],
): PlayerActions {
  return {
    movement: [...movement, null, null, null, null].slice(0, 4),
    cannons: [
      ...cannons,
      ...emptyCannonQueue(),
    ].slice(0, 4),
  };
}

const fire = (left: boolean, right: boolean): CannonSlot => ({ left, right });

describe('simultaneous movement', () => {
  it('stops both ships when they try to enter the same cell', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 5, 3, 'SOUTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['FORWARD']), b: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(5, 3));
    const blocked = result.events.filter((event) => event.type === 'SHIP_BLOCKED');
    expect(blocked).toHaveLength(2);
  });

  it('stops both ships when they would swap cells', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 5, 4, 'SOUTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['FORWARD']), b: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(5, 4));
  });

  it('stops a ship that moves into one that stays put', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 5, 4, 'NORTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(5, 4));
  });

  it('lets a ship follow another that is leaving its cell', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 6, 'NORTH'),
      makeShip('b', 'b', 5, 5, 'NORTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['FORWARD']), b: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(5, 4));
  });

  it('blocks a follower when the ship ahead is blocked', () => {
    const state = buildState(
      [makeShip('a', 'a', 5, 6, 'NORTH'), makeShip('b', 'b', 5, 5, 'NORTH')],
      { obstacles: { r: rock('r', 5, 4) } },
    );

    const result = resolveTurn(state, { a: plan(['FORWARD']), b: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 6));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(5, 5));
  });

  it('stops three ships contesting one cell', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 4, 4, 'EAST'),
      makeShip('c', 'c', 6, 4, 'WEST'),
    ]);

    const result = resolveTurn(state, {
      a: plan(['FORWARD']),
      b: plan(['FORWARD']),
      c: plan(['FORWARD']),
    });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(4, 4));
    expect(result.nextState.ships['c-ship'].position).toEqual(pos(6, 4));
  });

  it('gives the same result for every listing order of a contested cell', () => {
    const ships = [
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 4, 4, 'EAST'),
      makeShip('c', 'c', 6, 4, 'WEST'),
    ];
    const plans = {
      a: plan(['FORWARD']),
      b: plan(['FORWARD']),
      c: plan(['FORWARD']),
    };
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];

    for (const order of orders) {
      const result = resolveTurn(
        buildState(order.map((index) => ships[index])),
        plans,
      );
      expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
      expect(result.nextState.ships['b-ship'].position).toEqual(pos(4, 4));
      expect(result.nextState.ships['c-ship'].position).toEqual(pos(6, 4));
    }
  });

  it('still rotates a turning ship that is stopped by another ship', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 5, 4, 'NORTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['TURN_RIGHT']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 5));
    expect(result.nextState.ships['a-ship'].heading).toBe('EAST');
  });

  it('does not depend on the order players are listed in', () => {
    const ships = [
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 5, 3, 'SOUTH'),
      makeShip('c', 'c', 8, 8, 'NORTH'),
    ];
    const plans = {
      a: plan(['FORWARD', 'TURN_LEFT']),
      b: plan(['FORWARD', 'TURN_RIGHT']),
      c: plan(['FORWARD', 'FORWARD']),
    };

    const forward = resolveTurn(buildState(ships), plans);
    const reversed = resolveTurn(buildState([...ships].reverse()), plans);

    for (const id of ['a-ship', 'b-ship', 'c-ship']) {
      expect(reversed.nextState.ships[id]).toEqual(forward.nextState.ships[id]);
    }
  });
});

describe('simultaneous fire', () => {
  it('lets two ships destroy each other in the same phase (draw)', () => {
    const state = buildState([
      makeShip('a', 'a', 10, 10, 'NORTH', { hp: 1 }),
      makeShip('b', 'b', 8, 10, 'SOUTH', { hp: 1 }),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, false)]),
      b: plan([], [fire(true, false)]),
    });

    expect(result.nextState.ships['a-ship'].hp).toBe(0);
    expect(result.nextState.ships['b-ship'].hp).toBe(0);
    expect(result.nextState.outcome).toEqual({ kind: 'draw' });
    expect(result.nextState.status).toBe('game_over');
  });

  it('applies damage after every shot, so a dying ship still fires', () => {
    const state = buildState([
      makeShip('a', 'a', 10, 10, 'NORTH'),
      makeShip('b', 'b', 8, 10, 'SOUTH', { hp: 1 }),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, false)]),
      b: plan([], [fire(true, false)]),
    });

    expect(result.nextState.ships['b-ship'].hp).toBe(0);
    expect(result.nextState.ships['a-ship'].hp).toBe(3);
  });

  it('fires from the positions reached after this phase of movement', () => {
    // b sails into a's broadside during the same phase a fires.
    const state = buildState([
      makeShip('a', 'a', 10, 10, 'NORTH'),
      makeShip('b', 'b', 7, 10, 'EAST', { armed: false }),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, false)]),
      b: plan(['FORWARD']),
    });

    expect(result.nextState.ships['b-ship'].position).toEqual(pos(8, 10));
    expect(result.nextState.ships['b-ship'].hp).toBe(3);
  });

  it('lets several ships hit one target in the same phase', () => {
    // a fires west from the east of b; d fires east from the west of b.
    const state = buildState([
      makeShip('b', 'b', 8, 10, 'SOUTH', { armed: false }),
      makeShip('a', 'a', 10, 10, 'NORTH'),
      makeShip('d', 'd', 6, 10, 'SOUTH'),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, false)]),
      d: plan([], [fire(true, false)]),
    });

    expect(result.nextState.ships['b-ship'].hp).toBe(2);
  });
});

describe('friendly fire', () => {
  const teammates = (friendlyFire: boolean) =>
    buildState(
      [
        makeShip('a', 'red', 10, 10, 'NORTH'),
        makeShip('b', 'red', 8, 10, 'SOUTH', { armed: false }),
        makeShip('c', 'blue', 1, 1, 'SOUTH', { armed: false }),
      ],
      { rules: { ...createGame().rules, friendlyFire } },
    );

  it('stops a shot at a teammate without damage when disabled', () => {
    const result = resolveTurn(teammates(false), { a: plan([], [fire(true, false)]) });

    expect(result.nextState.ships['b-ship'].hp).toBe(4);
    const hit = result.events.find((event) => event.type === 'PROJECTILE_HIT');
    expect(hit).toMatchObject({ targetId: 'b-ship', damage: 0 });
  });

  it('damages a teammate when enabled', () => {
    const result = resolveTurn(teammates(true), { a: plan([], [fire(true, false)]) });

    expect(result.nextState.ships['b-ship'].hp).toBe(3);
  });
});

describe('outcome', () => {
  it('keeps playing while two teams still have ships', () => {
    const state = buildState([
      makeShip('a', 'red', 10, 10, 'NORTH'),
      makeShip('b', 'blue', 8, 10, 'SOUTH', { hp: 1, armed: false }),
      makeShip('c', 'green', 1, 1, 'SOUTH', { armed: false }),
    ]);

    const result = resolveTurn(state, { a: plan([], [fire(true, false)]) });

    expect(result.nextState.ships['b-ship'].hp).toBe(0);
    expect(result.nextState.outcome).toBeNull();
    expect(result.nextState.status).toBe('planning');
  });

  it('a team wins when it is the last with a ship afloat', () => {
    const state = buildState([
      makeShip('a', 'red', 10, 10, 'NORTH'),
      makeShip('a2', 'red', 10, 14, 'NORTH', { armed: false }),
      makeShip('b', 'blue', 8, 10, 'SOUTH', { hp: 1, armed: false }),
    ]);

    const result = resolveTurn(state, { a: plan([], [fire(true, false)]) });

    expect(result.nextState.outcome).toEqual({ kind: 'win', teamId: 'red' });
  });

  it('ignores a destroyed ship in later phases', () => {
    const state = buildState([
      makeShip('a', 'red', 10, 10, 'NORTH'),
      makeShip('b', 'blue', 8, 10, 'SOUTH', { hp: 1, armed: false }),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, false)]),
      b: plan([null, 'FORWARD', 'FORWARD', 'FORWARD']),
    });

    // b is sunk in phase 0, so its later moves never happen.
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(8, 10));
  });
});

describe('plans for every player', () => {
  it('treats a player with no submitted plan as passing', () => {
    const state = buildState([
      makeShip('a', 'a', 5, 5, 'NORTH'),
      makeShip('b', 'b', 12, 12, 'NORTH'),
    ]);

    const result = resolveTurn(state, { a: plan(['FORWARD']) });

    expect(result.nextState.ships['a-ship'].position).toEqual(pos(5, 4));
    expect(result.nextState.ships['b-ship'].position).toEqual(pos(12, 12));
  });

  it('spends each player cannonball pool separately', () => {
    const state = buildState([
      makeShip('a', 'a', 10, 10, 'NORTH'),
      makeShip('b', 'b', 8, 10, 'SOUTH'),
    ]);

    const result = resolveTurn(state, {
      a: plan([], [fire(true, true)]),
      b: plan([], [fire(true, false)]),
    });

    const start = state.players.a.ammo;
    expect(result.nextState.players.a.ammo).toBe(start - 2);
    expect(result.nextState.players.b.ammo).toBe(start - 1);
  });

  it('does not mutate the input state', () => {
    const state = buildState([
      makeShip('a', 'a', 10, 10, 'NORTH'),
      makeShip('b', 'b', 8, 10, 'SOUTH'),
    ]);
    const before = JSON.stringify(state);

    resolveTurn(state, { a: plan(['FORWARD'], [fire(true, false)]) });

    expect(JSON.stringify(state)).toBe(before);
  });
});
