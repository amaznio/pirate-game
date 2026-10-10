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
import { remainingAmmo, setCannonShots, toggleCannon, emptyDraft } from '../../client/draft';
import { planAiActions } from '../../ai/simpleAI';
import { previewPlayerPlan } from '../preview';
import { cannon, defaultEnemy, defaultPlayer, gameWith, submitted, withAmmo } from './testUtils';

const light = 'lightCannon';
const THREE: WeaponMount[] = [
  { weaponTypeId: light, side: 'left' },
  { weaponTypeId: light, side: 'left' },
  { weaponTypeId: light, side: 'left' },
  { weaponTypeId: light, side: 'right' },
  { weaponTypeId: light, side: 'right' },
  { weaponTypeId: light, side: 'right' },
];

function of<T extends GameEvent['type']>(events: readonly GameEvent[], type: T) {
  return events.filter((event) => event.type === type) as Extract<GameEvent, { type: T }>[];
}

/** A three-cannon-a-side ship at (10, 10) facing `heading`, with an enemy at `enemyAt`. */
function armed(heading: Direction = 'NORTH', enemyAt = pos(1, 1), enemyHp?: number): GameState {
  const player = defaultPlayer({ position: pos(10, 10), heading, weapons: THREE });
  const enemy = defaultEnemy({
    position: enemyAt,
    heading: 'SOUTH',
    ...(enemyHp === undefined ? {} : { hp: enemyHp }),
  });
  return withAmmo(gameWith(player, enemy), 'player', 20);
}

describe('several cannons on a side', () => {
  for (const heading of ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const) {
    it(`all fire from the ship's own cell, in the same direction (${heading})`, () => {
      const result = resolveTurn(armed(heading), submitted([], [cannon(3, 3)]));

      const fired = of(result.events, 'CANNON_FIRED');
      expect(fired).toHaveLength(6);
      for (const event of fired) {
        expect(event.from).toEqual(pos(10, 10));
      }
      for (const side of ['left', 'right'] as const) {
        const ofSide = fired.filter((event) => event.side === side);
        expect(new Set(ofSide.map((event) => event.direction)).size).toBe(1);
      }
    });
  }

  it('fire one after the other, numbered, each followed by its own impact', () => {
    const result = resolveTurn(armed('NORTH', pos(8, 10)), submitted([], [cannon(3, 0)]));

    const shots = result.events.filter(
      (event) => event.type === 'CANNON_FIRED' || event.type === 'PROJECTILE_HIT',
    );
    expect(shots.map((event) => `${event.type}:${(event as { cannon?: number }).cannon}`)).toEqual([
      'CANNON_FIRED:0',
      'PROJECTILE_HIT:0',
      'CANNON_FIRED:1',
      'PROJECTILE_HIT:1',
      'CANNON_FIRED:2',
      'PROJECTILE_HIT:2',
    ]);
  });

  it('leave a lone cannon unnumbered, so a sloop plays exactly as before', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(8, 10), heading: 'SOUTH' });
    const result = resolveTurn(gameWith(player, enemy), submitted([], [cannon(true, false)]));

    for (const event of result.events) {
      expect('cannon' in event).toBe(false);
    }
  });

  it('stack their damage on the ship in the way', () => {
    const state = armed('NORTH', pos(8, 10));

    const result = resolveTurn(state, submitted([], [cannon(3, 0)]));

    expect(result.nextState.ships['enemy-ship'].hp).toBe(state.ships['enemy-ship'].hp - 3);
    expect(of(result.events, 'PROJECTILE_HIT')).toHaveLength(3);
  });

  it('all miss together when nothing is in the way', () => {
    const result = resolveTurn(armed('NORTH', pos(8, 9)), submitted([], [cannon(3, 0)]));

    expect(of(result.events, 'PROJECTILE_MISSED')).toHaveLength(3);
    expect(result.nextState.ships['enemy-ship'].hp).toBe(4);
  });

  it('are stopped by a rock like a single cannon, every one of them', () => {
    const state = {
      ...armed('NORTH', pos(7, 10)),
      obstacles: { r: { id: 'r', kind: 'rock' as const, position: pos(9, 10) } },
    };

    const result = resolveTurn(state, submitted([], [cannon(3, 0)]));

    expect(of(result.events, 'PROJECTILE_HIT').every((event) => event.targetKind === 'rock')).toBe(true);
    expect(result.nextState.ships['enemy-ship'].hp).toBe(4);
  });

  it('sink a ship once, however many cannons hit it after it is gone', () => {
    // Three cannons on a ship with 2 hull points: the third shot has nothing left to damage.
    const result = resolveTurn(armed('NORTH', pos(8, 10), 2), submitted([], [cannon(3, 0)]));

    expect(of(result.events, 'SHIP_DESTROYED')).toHaveLength(1);
    expect(result.nextState.ships['enemy-ship'].hp).toBe(0);
    expect(of(result.events, 'SHIP_DAMAGED').map((event) => event.amount)).toEqual([1, 1]);
  });
});

describe('cannonball cost', () => {
  it('spends one cannonball per cannon fired', () => {
    const both = resolveTurn(armed('NORTH'), submitted([], [cannon(3, 3)]));
    expect(both.nextState.players.player.ammo).toBe(20 - 6);

    const one = resolveTurn(armed('NORTH'), submitted([], [cannon(0, 3)]));
    expect(one.nextState.players.player.ammo).toBe(20 - 3);
  });

  it('fires the first cannons in order when the pool runs short, and reports the rest', () => {
    const state = withAmmo(armed('NORTH'), 'player', 4);

    const result = resolveTurn(state, submitted([], [cannon(3, 3)]));

    // The left side's three cannons, then the right side gets the last cannonball.
    const fired = of(result.events, 'CANNON_FIRED');
    expect(fired).toHaveLength(4);
    expect(fired.filter((event) => event.side === 'right')).toHaveLength(1);
    expect(of(result.events, 'CANNON_BLOCKED').filter((event) => event.reason === 'out_of_ammo')).toHaveLength(2);
    expect(result.nextState.players.player.ammo).toBe(0);
  });

  it('counts the cannons on a ship', () => {
    expect(cannonCountsOf({ weapons: THREE })).toEqual({ left: 3, right: 3 });
    expect(cannonCountsOf({ weapons: [] })).toEqual({ left: 0, right: 0 });
    expect(cannonQueueCost([cannon(3, 2), cannon(3, 0)], { left: 3, right: 2 })).toBe(3 + 2 + 3);
    // Asking for more than a side has costs only what it has.
    expect(cannonQueueCost([cannon(9, 9)], { left: 3, right: 2 })).toBe(5);
  });

  it('costs nothing to fire a side that has no cannon', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH', weapons: [] });
    const enemy = defaultEnemy({ position: pos(1, 1) });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(1, 1)]));

    expect(of(result.events, 'CANNON_FIRED')).toHaveLength(0);
    expect(result.nextState.players.player.ammo).toBe(state.players.player.ammo);
  });
});

describe('ship classes', () => {
  const duel = (player: string) =>
    createGame(createDuelConfig({ sea: 'open', shipTypeIds: [player, 'sloop'] }));

  it('builds the sloop exactly as before', () => {
    expect(duel('sloop').ships['player-ship'].weapons).toEqual([
      { weaponTypeId: light, side: 'left' },
      { weaponTypeId: light, side: 'right' },
    ]);
  });

  it('gives the brigantine two cannons a side and the galleon three', () => {
    expect(cannonCountsOf(duel('sloop').ships['player-ship'])).toEqual({ left: 1, right: 1 });
    expect(cannonCountsOf(duel('brigantine').ships['player-ship'])).toEqual({ left: 2, right: 2 });
    expect(cannonCountsOf(duel('galleon').ships['player-ship'])).toEqual({ left: 3, right: 3 });
    expect(getShipType('galleon').cannons?.count).toBe(3);
  });

  it('starts with, and reloads, the ammunition of its class', () => {
    const start = (id: string) => duel(id).players.player.ammo;
    const reload = (id: string) => {
      const state = duel(id);
      return beginNextTurn(state).state.players.player.ammo - state.players.player.ammo;
    };

    expect([start('sloop'), start('brigantine'), start('galleon')]).toEqual([3, 5, 7]);
    expect([reload('sloop'), reload('brigantine'), reload('galleon')]).toEqual([1, 2, 2]);
  });
});

describe('planning a volley', () => {
  const galleon = () => createGame(createDuelConfig({ sea: 'open', shipTypeIds: ['galleon', 'sloop'] }));
  const idle = [null, null, null, null] as const;

  it('rejects a plan that costs more cannonballs than the ship holds', () => {
    // 7 cannonballs: two three-cannon sides cost 6, a third costs 3 more.
    const fits = applyPlayerPlan(galleon(), 'player', {
      movement: [...idle],
      cannons: [cannon(3, 3), cannon(0, 0), cannon(0, 0), cannon(0, 0)],
    });
    const tooMuch = applyPlayerPlan(galleon(), 'player', {
      movement: [...idle],
      cannons: [cannon(3, 3), cannon(3, 0), cannon(0, 0), cannon(0, 0)],
    });

    expect(fits.ok).toBe(true);
    expect(tooMuch).toEqual({ ok: false, reason: 'not_enough_ammo' });
  });

  it('only lets a side be queued when every cannon on it can be paid for', () => {
    const counts = { left: 3, right: 3 };
    let draft = toggleCannon(emptyDraft(), 7, 0, 'left', counts);
    draft = toggleCannon(draft, 7, 0, 'right', counts);
    draft = toggleCannon(draft, 7, 1, 'left', counts);

    // The first two sides take all three cannons; one cannonball is left for the third.
    expect(draft.cannons[0]).toEqual({ left: 3, right: 3 });
    expect(draft.cannons[1]).toEqual({ left: 1, right: 0 });
    expect(remainingAmmo(7, draft.cannons, counts)).toBe(0);
  });

  it('still costs one per side for a ship the client knows nothing about', () => {
    let draft = toggleCannon(emptyDraft(), 1, 0, 'left');
    draft = toggleCannon(draft, 1, 0, 'right');

    expect(draft.cannons[0]).toEqual({ left: 1, right: 0 });
  });
});

describe('choosing how many cannons to fire', () => {
  const counts = { left: 3, right: 3 };

  it('lets a side fire one, two or all three, each costing a cannonball', () => {
    for (const shots of [1, 2, 3]) {
      const result = resolveTurn(armed('NORTH', pos(8, 10)), submitted([], [cannon(shots, 0)]));

      expect(of(result.events, 'CANNON_FIRED')).toHaveLength(shots);
      expect(result.nextState.players.player.ammo).toBe(20 - shots);
      expect(result.nextState.ships['enemy-ship'].hp).toBe(4 - shots);
    }
  });

  it('fires the first cannons of the side, in order', () => {
    const result = resolveTurn(armed('NORTH', pos(8, 10)), submitted([], [cannon(2, 0)]));

    expect(of(result.events, 'CANNON_FIRED').map((event) => event.cannon)).toEqual([0, 1]);
  });

  it('can differ between the two sides and between phases', () => {
    const result = resolveTurn(
      armed('NORTH', pos(1, 1)),
      submitted([], [cannon(1, 3), cannon(2, 0), cannon(0, 0), cannon(0, 2)]),
    );

    expect(of(result.events, 'CANNON_FIRED')).toHaveLength(1 + 3 + 2 + 2);
    expect(result.nextState.players.player.ammo).toBe(20 - 8);
  });

  it('rejects a plan that asks a side for more cannons than it has', () => {
    const state = createGame(createDuelConfig({ sea: 'open', shipTypeIds: ['galleon', 'sloop'] }));
    const plan = (left: number) => ({
      movement: [null, null, null, null],
      cannons: [cannon(left, 0), cannon(0, 0), cannon(0, 0), cannon(0, 0)],
    });

    expect(applyPlayerPlan(state, 'player', plan(3)).ok).toBe(true);
    expect(applyPlayerPlan(state, 'player', plan(4))).toEqual({ ok: false, reason: 'malformed_plan' });
    expect(applyPlayerPlan(state, 'player', plan(-1))).toEqual({ ok: false, reason: 'malformed_plan' });
  });

  it('is set in the draft to the nearest legal number', () => {
    const set = (draft: ReturnType<typeof emptyDraft>, shots: number, ammo = 7) =>
      setCannonShots(draft, ammo, 0, 'left', shots, counts);

    expect(set(emptyDraft(), 2).cannons[0].left).toBe(2);
    expect(set(emptyDraft(), 9).cannons[0].left).toBe(3);
    expect(set(emptyDraft(), -4).cannons[0].left).toBe(0);
    // Only two cannonballs: asking for three gives two.
    expect(set(emptyDraft(), 3, 2).cannons[0].left).toBe(2);
    // Lowering frees the cannonballs again.
    const two = set(emptyDraft(), 2);
    expect(remainingAmmo(7, two.cannons, counts)).toBe(5);
    expect(remainingAmmo(7, set(two, 1).cannons, counts)).toBe(6);
  });

  it('can be turned all on or all off with one tap', () => {
    const on = toggleCannon(emptyDraft(), 7, 0, 'right', counts);
    const off = toggleCannon(on, 7, 0, 'right', counts);

    expect(on.cannons[0].right).toBe(3);
    expect(off.cannons[0].right).toBe(0);
  });
});

describe('the AI with several cannons', () => {
  const noTokens = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };

  function aiState(enemyAt: { x: number; y: number }, ammo: number, enemyHp = 4): GameState {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH', weapons: THREE });
    const enemy = defaultEnemy({ position: pos(enemyAt.x, enemyAt.y), heading: 'SOUTH', hp: enemyHp });
    const state = withAmmo(gameWith(player, enemy), 'player', ammo);
    return {
      ...state,
      players: {
        ...state.players,
        player: { ...state.players.player, controller: 'ai', tokens: noTokens },
      },
    };
  }

  it('fires a side when the target is in its line', () => {
    const plan = planAiActions(aiState({ x: 8, y: 10 }, 10), 'player', 'hard');

    expect(plan.cannons.some((slot) => slot.left)).toBe(true);
  });

  it('fires as many cannons as it can pay for', () => {
    const plan = planAiActions(aiState({ x: 8, y: 10 }, 2), 'player', 'hard');

    expect(Math.max(...plan.cannons.map((slot) => slot.left))).toBe(2);
  });

  it('fires every cannon when the target can take them', () => {
    const plan = planAiActions(aiState({ x: 8, y: 10 }, 10), 'player', 'hard');

    expect(Math.max(...plan.cannons.map((slot) => slot.left))).toBe(3);
  });

  it('holds back cannons that would only overkill a ship', () => {
    // The target has 2 hull points left: two cannons sink it, the third would be wasted.
    const plan = planAiActions(aiState({ x: 8, y: 10 }, 10, 2), 'player', 'hard');

    expect(Math.max(...plan.cannons.map((slot) => slot.left))).toBe(2);
  });

  it('holds its fire when the target is not in line', () => {
    const plan = planAiActions(aiState({ x: 8, y: 9 }, 10), 'player', 'hard');

    expect(plan.cannons.some((slot) => slot.left || slot.right)).toBe(false);
  });
});

describe('the plan preview', () => {
  it('draws one line for the cannons of a side, not one on top of another', () => {
    const state = createGame(createDuelConfig({ sea: 'open', shipTypeIds: ['galleon', 'sloop'] }));
    const planned = applyPlayerPlan(state, 'player', {
      movement: [null, null, null, null],
      cannons: [cannon(3, 3), cannon(0, 0), cannon(0, 0), cannon(0, 0)],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    const preview = previewPlayerPlan(planned.state, 'player');

    expect(preview?.steps[0].shots.map((shot) => shot.side).sort()).toEqual(['left', 'right']);
  });
});
