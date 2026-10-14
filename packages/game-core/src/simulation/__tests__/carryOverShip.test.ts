import { describe, expect, it } from 'vitest';
import { createDuelConfig } from '../../config/matchConfig';
import { CARRY_MAX_CANNONS, CARRY_MAX_HULL, carriedCannons, carriedMaxHull } from '../../domain/CarryOver';
import { cannonCountsOf } from '../../domain/Ship';
import { planAiActions } from '../../ai/simpleAI';
import { createGame } from '../createGame';
import { resolveTurn } from '../resolveTurn';
import { redactState } from '../../view/redact';
import { defaultEnemy, defaultPlayer, gameWith, submitted } from './testUtils';

const base = createDuelConfig({ sea: 'open', shipTypeIds: ['sloop', 'sloop'] });

describe('carry-over: a ship that has grown', () => {
  it('changes nothing when the new fields are absent', () => {
    expect(createGame({ ...base, carryOver: { player: { hull: 3, ammo: 2 } } })).toEqual(
      createGame({ ...base, carryOver: { player: { hull: 3, ammo: 2, maxHull: undefined, cannonsPerSide: undefined } } }),
    );
    expect(createGame(base).ships['player-ship'].maxHp).toBe(4);
    expect(cannonCountsOf(createGame(base).ships['player-ship'])).toEqual({ left: 1, right: 1 });
  });

  it('gives a ship a bigger maximum hull than its class', () => {
    const state = createGame({ ...base, carryOver: { player: { maxHull: 9 } } });
    const ship = state.ships['player-ship'];
    expect(ship.maxHp).toBe(9);
    expect(ship.hp).toBe(9);
    // Only that ship: the other keeps its class's hull.
    expect(state.ships['enemy-ship'].maxHp).toBe(4);
  });

  it('keeps the carried hull inside the new maximum', () => {
    const grown = (carry: object) => createGame({ ...base, carryOver: { player: carry } }).ships['player-ship'];
    expect(grown({ maxHull: 8, hull: 7 })).toMatchObject({ hp: 7, maxHp: 8 });
    expect(grown({ maxHull: 8, hull: 50 })).toMatchObject({ hp: 8, maxHp: 8 });
    expect(grown({ maxHull: 8, hull: 0 })).toMatchObject({ hp: 1, maxHp: 8 });
    expect(grown({ maxHull: 3, hull: 6 })).toMatchObject({ hp: 3, maxHp: 3 });
    // Without a new maximum, the class's maximum still holds the hull down.
    expect(grown({ hull: 50 })).toMatchObject({ hp: 4, maxHp: 4 });
  });

  it('gives a ship more cannons on each side than its class', () => {
    const state = createGame({ ...base, carryOver: { player: { cannonsPerSide: 3 } } });
    expect(cannonCountsOf(state.ships['player-ship'])).toEqual({ left: 3, right: 3 });
    expect(cannonCountsOf(state.ships['enemy-ship'])).toEqual({ left: 1, right: 1 });
    const fewer = createGame({
      ...createDuelConfig({ sea: 'open', shipTypeIds: ['galleon', 'sloop'] }),
      carryOver: { player: { cannonsPerSide: 1 } },
    });
    expect(cannonCountsOf(fewer.ships['player-ship'])).toEqual({ left: 1, right: 1 });
  });

  it('holds the new fields to the limits, whole numbers only', () => {
    expect(carriedMaxHull(undefined)).toBeUndefined();
    expect(carriedMaxHull(0)).toBe(1);
    expect(carriedMaxHull(7.6)).toBe(8);
    expect(carriedMaxHull(500)).toBe(CARRY_MAX_HULL);
    expect(carriedCannons(undefined)).toBeUndefined();
    expect(carriedCannons(-2)).toBe(1);
    expect(carriedCannons(2.4)).toBe(2);
    expect(carriedCannons(99)).toBe(CARRY_MAX_CANNONS);
    const state = createGame({ ...base, carryOver: { player: { maxHull: 999, cannonsPerSide: 99 } } });
    expect(state.ships['player-ship'].maxHp).toBe(CARRY_MAX_HULL);
    expect(cannonCountsOf(state.ships['player-ship']).left).toBe(CARRY_MAX_CANNONS);
  });

  it('reaches the players in the view, so the screen draws the right cannons and hull', () => {
    const state = createGame({ ...base, carryOver: { player: { maxHull: 7, cannonsPerSide: 2 } } });
    const view = redactState(state, 'player', null);
    const mine = Object.values(view.ships).find((ship) => ship.ownerId === 'player')!;
    expect(mine.maxHp).toBe(7);
    expect(cannonCountsOf(mine)).toEqual({ left: 2, right: 2 });
  });
});

describe('a grown ship in play', () => {
  const config = { ...base, carryOver: { player: { cannonsPerSide: 3, maxHull: 8 } } };

  it('fires every cannon it has, one cannonball each', () => {
    const start = createGame(config);
    const state = gameWith(
      { ...start.ships['player-ship'], position: { x: 10, y: 10 }, heading: 'NORTH' },
      { ...defaultEnemy({ position: { x: 7, y: 10 }, heading: 'SOUTH' }), hp: 4 },
    );
    const withAmmo = { ...state, players: { ...state.players, player: { ...state.players.player, ammo: 5 } } };
    const result = resolveTurn(withAmmo, submitted([], [{ left: 3, right: 0 }]));
    const hits = result.events.filter((event) => event.type === 'PROJECTILE_HIT');
    expect(hits.length).toBeGreaterThan(0);
    // Three cannons at 1 damage each sink a ship of 4 hull in at most three shots and stop when it sinks.
    expect(result.nextState.ships['enemy-ship'].hp).toBeLessThan(4);
    expect(result.nextState.players.player.ammo).toBeLessThan(5);
  });

  it('lets the AI plan with the cannons it has', () => {
    const start = createGame(config);
    const plan = planAiActions({ ...start, players: { ...start.players } }, 'player');
    for (const slot of plan.cannons) {
      expect(slot.left).toBeLessThanOrEqual(3);
      expect(slot.right).toBeLessThanOrEqual(3);
    }
  });

  it('draws the same ship every time', () => {
    expect(createGame(config)).toEqual(createGame(config));
    expect(defaultPlayer().weapons.length).toBeGreaterThan(0);
  });
});
