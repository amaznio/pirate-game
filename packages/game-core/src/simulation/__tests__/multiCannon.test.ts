import { describe, expect, it } from 'vitest';
import { pos } from '../../domain/Position';
import type { Direction } from '../../domain/Direction';
import type { GameEvent } from '../../domain/GameEvent';
import type { GameState } from '../../domain/GameState';
import type { WeaponMount } from '../../domain/Ship';
import { cannonCountsOf, cannonQueueCost } from '../../domain/Ship';
import { createDuelConfig } from '../../config/matchConfig';
import { getShipType } from '../../config/shipTypes';
import { createGame } from '../createGame';
import { applyPlayerPlan } from '../plans';
import { resolveTurn } from '../resolveTurn';
import { beginNextTurn } from '../tokens';
import { remainingAmmo, toggleCannon, emptyDraft } from '../../client/draft';
import { planAiActions } from '../../ai/simpleAI';
import { cannon, defaultEnemy, defaultPlayer, gameWith, rock, submitted, withAmmo } from './testUtils';

const light = 'lightCannon';
const THREE: WeaponMount[] = [
  { weaponTypeId: light, side: 'left' },
  { weaponTypeId: light, side: 'left', lane: 1 },
  { weaponTypeId: light, side: 'left', lane: -1 },
  { weaponTypeId: light, side: 'right' },
  { weaponTypeId: light, side: 'right', lane: 1 },
  { weaponTypeId: light, side: 'right', lane: -1 },
];

function of<T extends GameEvent['type']>(events: readonly GameEvent[], type: T) {
  return events.filter((event) => event.type === type) as Extract<GameEvent, { type: T }>[];
}

/** A three-cannon-a-side ship at (10, 10) facing `heading`, with a harmless enemy. */
function armed(heading: Direction = 'NORTH', enemyAt = pos(1, 1)): GameState {
  const player = defaultPlayer({ position: pos(10, 10), heading, weapons: THREE });
  const enemy = defaultEnemy({ position: enemyAt, heading: 'SOUTH' });
  return withAmmo(gameWith(player, enemy), 'player', 20);
}

const AHEAD: Record<Direction, { x: number; y: number }> = {
  NORTH: { x: 0, y: -1 },
  EAST: { x: 1, y: 0 },
  SOUTH: { x: 0, y: 1 },
  WEST: { x: -1, y: 0 },
};

describe('where each cannon fires from', () => {
  for (const heading of ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const) {
    it(`starts fore and aft shots one cell along the heading (${heading})`, () => {
      const result = resolveTurn(armed(heading), submitted([], [cannon(true, true)]));

      const fired = of(result.events, 'CANNON_FIRED');
      const ahead = AHEAD[heading];
      for (const side of ['left', 'right'] as const) {
        const origins = fired
          .filter((event) => event.side === side)
          .map((event) => event.from);

        // In firing order: abeam, fore, aft.
        expect(origins).toEqual([
          pos(10, 10),
          pos(10 + ahead.x, 10 + ahead.y),
          pos(10 - ahead.x, 10 - ahead.y),
        ]);
      }
    });
  }

  it('fires every cannon of a side in the same direction', () => {
    const result = resolveTurn(armed('NORTH'), submitted([], [cannon(true, false)]));

    const fired = of(result.events, 'CANNON_FIRED');
    expect(fired).toHaveLength(3);
    expect(new Set(fired.map((event) => event.direction))).toEqual(new Set(['WEST']));
  });

  it('lets a side cannon hit a target the abeam cannon would miss', () => {
    // Facing north, the left side fires west. A ship one row ahead (y = 9) lies in the fore lane.
    const state = armed('NORTH', pos(8, 9));
    const enemy = state.ships['enemy-ship'];

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    const hits = of(result.events, 'PROJECTILE_HIT').filter((event) => event.targetId === enemy.id);
    expect(hits).toHaveLength(1);
    expect(hits[0].from).toEqual(pos(10, 9));
    expect(result.nextState.ships['enemy-ship'].hp).toBe(enemy.hp - 1);
  });

  it('hits a target on the abeam row with the abeam cannon only', () => {
    const state = armed('NORTH', pos(8, 10));

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    const hits = of(result.events, 'PROJECTILE_HIT');
    expect(hits).toHaveLength(1);
    expect(hits[0].from).toEqual(pos(10, 10));
    expect(of(result.events, 'PROJECTILE_MISSED')).toHaveLength(2);
  });
});

describe('a cannon whose lane cell is taken', () => {
  const obstructed = (state: GameState) =>
    of(resolveTurn(state, submitted([], [cannon(true, false)])).events, 'CANNON_BLOCKED').filter(
      (event) => event.reason === 'obstructed',
    );

  it('does not fire when the fore cell is a rock', () => {
    const state = { ...armed('NORTH'), obstacles: { r: rock('r', 10, 9) } };
    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(of(result.events, 'CANNON_FIRED')).toHaveLength(2);
    expect(obstructed(state)).toHaveLength(1);
    // Only the two cannons that fired cost cannonballs.
    expect(result.nextState.players.player.ammo).toBe(18);
  });

  it('does not fire when the aft cell is another ship', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH', weapons: THREE });
    const enemy = defaultEnemy({ position: pos(10, 11), heading: 'SOUTH' });
    const state = withAmmo(gameWith(player, enemy), 'player', 20);

    expect(obstructed(state)).toHaveLength(1);
  });

  it('does not fire from a cell off the board', () => {
    const player = defaultPlayer({ position: pos(10, 0), heading: 'NORTH', weapons: THREE });
    const enemy = defaultEnemy({ position: pos(1, 5), heading: 'SOUTH' });
    const state = withAmmo(gameWith(player, enemy), 'player', 20);

    // The fore cell (10, -1) is off the board.
    expect(obstructed(state)).toHaveLength(1);
  });

  it('never blocks the abeam cannon', () => {
    const state = {
      ...armed('NORTH'),
      obstacles: { a: rock('a', 10, 9), b: rock('b', 10, 11) },
    };
    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(of(result.events, 'CANNON_FIRED')).toHaveLength(1);
    expect(of(result.events, 'CANNON_FIRED')[0].from).toEqual(pos(10, 10));
  });
});

describe('cannonball cost', () => {
  it('spends one cannonball per cannon fired', () => {
    const both = resolveTurn(armed('NORTH'), submitted([], [cannon(true, true)]));
    expect(both.nextState.players.player.ammo).toBe(20 - 6);

    const one = resolveTurn(armed('NORTH'), submitted([], [cannon(false, true)]));
    expect(one.nextState.players.player.ammo).toBe(20 - 3);
  });

  it('fires the first cannons in order when the pool runs short, and reports the rest', () => {
    const state = withAmmo(armed('NORTH'), 'player', 4);

    const result = resolveTurn(state, submitted([], [cannon(true, true)]));

    // Left side first: three cannons; then the right side gets the last cannonball (its abeam cannon).
    const fired = of(result.events, 'CANNON_FIRED');
    expect(fired).toHaveLength(4);
    expect(fired.filter((event) => event.side === 'right').map((event) => event.from)).toEqual([
      pos(10, 10),
    ]);
    const dry = of(result.events, 'CANNON_BLOCKED').filter((event) => event.reason === 'out_of_ammo');
    expect(dry).toHaveLength(2);
    expect(result.nextState.players.player.ammo).toBe(0);
  });

  it('counts the cannons on a ship', () => {
    expect(cannonCountsOf({ weapons: THREE })).toEqual({ left: 3, right: 3 });
    expect(cannonCountsOf({ weapons: [] })).toEqual({ left: 0, right: 0 });
    expect(cannonQueueCost([cannon(true, true), cannon(true, false)], { left: 3, right: 2 })).toBe(
      3 + 2 + 3,
    );
  });

  it('costs nothing to fire a side that has no cannon', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH', weapons: [] });
    const enemy = defaultEnemy({ position: pos(1, 1) });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, true)]));

    expect(of(result.events, 'CANNON_FIRED')).toHaveLength(0);
    expect(result.nextState.players.player.ammo).toBe(state.players.player.ammo);
  });
});

describe('ship classes', () => {
  const duel = (player: string) =>
    createGame(createDuelConfig({ sea: 'open', shipTypeIds: [player, 'sloop'] }));

  it('builds the sloop exactly as before, with no lane on its mounts', () => {
    expect(duel('sloop').ships['player-ship'].weapons).toEqual([
      { weaponTypeId: light, side: 'left' },
      { weaponTypeId: light, side: 'right' },
    ]);
  });

  it('gives the brigantine two cannons a side and the galleon three', () => {
    expect(cannonCountsOf(duel('brigantine').ships['player-ship'])).toEqual({ left: 2, right: 2 });
    expect(cannonCountsOf(duel('galleon').ships['player-ship'])).toEqual({ left: 3, right: 3 });
    expect(
      duel('brigantine')
        .ships['player-ship'].weapons.filter((mount) => mount.side === 'left')
        .map((mount) => mount.lane ?? 0),
    ).toEqual([0, 1]);
    expect(
      duel('galleon')
        .ships['player-ship'].weapons.filter((mount) => mount.side === 'right')
        .map((mount) => mount.lane ?? 0),
    ).toEqual([0, 1, -1]);
  });

  it('starts with, and reloads, the ammunition of its class', () => {
    const start = (id: string) => duel(id).players.player.ammo;
    const reload = (id: string) => {
      const state = duel(id);
      return beginNextTurn(state).state.players.player.ammo - state.players.player.ammo;
    };

    expect([start('sloop'), start('brigantine'), start('galleon')]).toEqual([3, 5, 7]);
    expect([reload('sloop'), reload('brigantine'), reload('galleon')]).toEqual([1, 2, 2]);
    expect(getShipType('galleon').cannons?.lanes).toEqual([0, 1, -1]);
  });
});

describe('planning a volley', () => {
  const galleon = () => createGame(createDuelConfig({ sea: 'open', shipTypeIds: ['galleon', 'sloop'] }));
  const idle = [null, null, null, null] as const;

  it('rejects a plan that costs more cannonballs than the ship holds', () => {
    // 7 cannonballs: two three-cannon sides cost 6, a third costs 3 more.
    const fits = applyPlayerPlan(galleon(), 'player', {
      movement: [...idle],
      cannons: [cannon(true, true), cannon(false, false), cannon(false, false), cannon(false, false)],
    });
    const tooMuch = applyPlayerPlan(galleon(), 'player', {
      movement: [...idle],
      cannons: [cannon(true, true), cannon(true, false), cannon(false, false), cannon(false, false)],
    });

    expect(fits.ok).toBe(true);
    expect(tooMuch).toEqual({ ok: false, reason: 'not_enough_ammo' });
  });

  it('only lets a side be queued when every cannon on it can be paid for', () => {
    const counts = { left: 3, right: 3 };
    let draft = toggleCannon(emptyDraft(), 7, 0, 'left', counts);
    draft = toggleCannon(draft, 7, 0, 'right', counts);
    draft = toggleCannon(draft, 7, 1, 'left', counts);

    expect(draft.cannons[0]).toEqual({ left: true, right: true });
    expect(draft.cannons[1]).toEqual({ left: false, right: false });
    expect(remainingAmmo(7, draft.cannons, counts)).toBe(1);
  });

  it('still costs one per side for a ship the client knows nothing about', () => {
    let draft = toggleCannon(emptyDraft(), 1, 0, 'left');
    draft = toggleCannon(draft, 1, 0, 'right');

    expect(draft.cannons[0]).toEqual({ left: true, right: false });
  });
});

describe('the AI with several cannons', () => {
  const noTokens = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };

  function aiState(enemyAt: { x: number; y: number }, ammo: number): GameState {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH', weapons: THREE });
    const enemy = defaultEnemy({ position: pos(enemyAt.x, enemyAt.y), heading: 'SOUTH' });
    const state = withAmmo(gameWith(player, enemy), 'player', ammo);
    return {
      ...state,
      players: {
        ...state.players,
        player: { ...state.players.player, controller: 'ai', tokens: noTokens },
      },
    };
  }

  it('fires when only a side cannon lines up a hit', () => {
    // Facing north, the left side fires west; the enemy is one row ahead, in the fore lane.
    const plan = planAiActions(aiState({ x: 8, y: 9 }, 10), 'player', 'hard');

    expect(plan.cannons.some((slot) => slot.left)).toBe(true);
  });

  it('does not fire a whole side it cannot pay for', () => {
    const plan = planAiActions(aiState({ x: 8, y: 9 }, 2), 'player', 'hard');

    expect(plan.cannons.some((slot) => slot.left || slot.right)).toBe(false);
  });

  it('holds its fire when nothing lines up', () => {
    const plan = planAiActions(aiState({ x: 1, y: 1 }, 10), 'player', 'hard');

    expect(plan.cannons.some((slot) => slot.left || slot.right)).toBe(false);
  });
});
