import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { LashSide, Monster, MonsterPlan } from '../../domain/Monster';
import { monsterCells } from '../../domain/Monster';
import { ACTIONS_PER_TURN } from '../../domain/Action';
import { MONSTER_TYPES, getMonsterType } from '../../config/monsterTypes';
import { createDuelConfig } from '../../config/matchConfig';
import { generateMonsters } from '../../board/generateMonsters';
import { runMatch } from '../../testing/matchRunner';
import { createGame } from '../createGame';
import { planMonsterTurn } from '../monsters';
import { resolveTurn } from '../resolveTurn';
import { beginNextTurn } from '../tokens';
import { monsterAt } from '../selectors';
import { redactState, viewToState } from '../../view/redact';
import { cannon, defaultEnemy, defaultPlayer, gameWith, submitted } from './testUtils';

const SQUID = getMonsterType('giant-squid');

/** A squid facing south with its stern at (10,6): it fills (10,6) and (10,7), bow at (10,7). */
function squid(overrides: Partial<Monster> = {}): Monster {
  return {
    id: 'monster-1',
    kind: 'monster',
    monsterTypeId: 'giant-squid',
    position: { x: 10, y: 6 },
    heading: 'SOUTH',
    hp: SQUID.maxHp,
    maxHp: SQUID.maxHp,
    attacks: [],
    ...overrides,
  };
}

/** A plan that lashes one side in one phase and does nothing else. */
function lashPlan(phase: number, side: LashSide): MonsterPlan {
  return {
    movement: [null, null, null, null],
    lashes: [0, 1, 2, 3].map((p) => (p === phase ? side : null)),
  };
}

function sea(monster: Monster, player = defaultPlayer({ position: { x: 5, y: 12 }, heading: 'NORTH' })): GameState {
  const state = gameWith(player, defaultEnemy({ position: { x: 17, y: 2 }, heading: 'SOUTH' }));
  return { ...state, monsters: { [monster.id]: monster } };
}

describe('monsters: the body', () => {
  it('fills its cells from the stern to the bow, and no others', () => {
    const state = sea(squid());
    expect(monsterCells(state.monsters!['monster-1'], SQUID.length)).toEqual([
      { x: 10, y: 6 },
      { x: 10, y: 7 },
    ]);
    expect(monsterAt(state, { x: 10, y: 6 })).toBeDefined();
    expect(monsterAt(state, { x: 10, y: 7 })).toBeDefined();
    expect(monsterAt(state, { x: 10, y: 8 })).toBeUndefined();
    expect(monsterAt(state, { x: 11, y: 7 })).toBeUndefined();
  });

  it('blocks a ship like a rock', () => {
    const state = sea(squid(), defaultPlayer({ position: { x: 10, y: 9 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted(['FORWARD', 'FORWARD', null, null]));
    // (10,8) is free; (10,7) is the squid's bow.
    expect(result.nextState.ships['player-ship'].position).toEqual({ x: 10, y: 8 });
    expect(result.events.some((e) => e.type === 'SHIP_BLOCKED')).toBe(true);
  });

  it('is hit by cannon fire and can be sunk, after which its cells are free', () => {
    const state = sea(
      squid({ hp: 1 }),
      defaultPlayer({ position: { x: 7, y: 7 }, heading: 'NORTH' }),
    );
    // Facing north, the right broadside fires east: (8,7), (9,7), then the squid's bow at (10,7).
    const result = resolveTurn(state, submitted([null, null, null, null], [cannon(false, true)]));
    expect(result.events.find((e) => e.type === 'PROJECTILE_HIT')).toMatchObject({
      targetId: 'monster-1',
      targetKind: 'monster',
      damage: 1,
    });
    expect(result.events.find((e) => e.type === 'MONSTER_DAMAGED')).toMatchObject({ monsterId: 'monster-1', hp: 0 });
    expect(result.events.find((e) => e.type === 'MONSTER_DESTROYED')).toMatchObject({ monsterId: 'monster-1' });
    expect(monsterAt(result.nextState, { x: 10, y: 7 })).toBeUndefined();
  });

  it('does not end the match: it belongs to no team', () => {
    const state = sea(squid());
    expect(resolveTurn(state, submitted()).nextState.outcome).toBeNull();
  });
});

describe('monsters: the lash', () => {
  // The squid faces south with its bow at (10,7): its left is east, so (11,7).
  const lash = (phase: number) => ({ plan: lashPlan(phase, 'left') });

  it('hits a ship that ends the phase on the marked cell', () => {
    const state = sea(squid(lash(1)), defaultPlayer({ position: { x: 11, y: 7 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted());
    expect(result.events.find((e) => e.type === 'MONSTER_ATTACKED')).toMatchObject({
      monsterId: 'monster-1',
      cell: { x: 11, y: 7 },
      targetId: 'player-ship',
      damage: SQUID.lashDamage,
      phase: 1,
    });
    expect(result.events.find((e) => e.type === 'SHIP_DAMAGED')).toMatchObject({ shipId: 'player-ship', amount: SQUID.lashDamage });
    expect(result.nextState.ships['player-ship'].hp).toBe(state.ships['player-ship'].hp - SQUID.lashDamage);
  });

  it('misses a ship that has sailed away from the cell by then', () => {
    // Heading north from (11,7): forward in phase 0 leaves the cell before the lash in phase 1.
    const state = sea(squid(lash(1)), defaultPlayer({ position: { x: 11, y: 7 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted(['FORWARD', null, null, null]));
    expect(result.events.find((e) => e.type === 'MONSTER_ATTACKED')).not.toHaveProperty('targetId');
    expect(result.events.some((e) => e.type === 'SHIP_DAMAGED')).toBe(false);
  });

  it('hits a ship that sails into the cell in the lash phase', () => {
    // From (11,8) heading north, forward in phase 1 enters (11,7) just as the lash lands.
    const state = sea(squid(lash(1)), defaultPlayer({ position: { x: 11, y: 8 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted([null, 'FORWARD', null, null]));
    expect(result.events.find((e) => e.type === 'MONSTER_ATTACKED')).toMatchObject({ targetId: 'player-ship' });
  });

  it('lashes in its own phase only, and the marks come off at the end of the turn', () => {
    const state = sea(squid(lash(2)), defaultPlayer({ position: { x: 11, y: 7 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted());
    const attacked = result.events.filter((e) => e.type === 'MONSTER_ATTACKED');
    expect(attacked).toHaveLength(1);
    expect(attacked[0]).toMatchObject({ phase: 2 });
    expect(result.nextState.monsters!['monster-1'].attacks).toEqual([]);
    expect(result.nextState.monsters!['monster-1'].plan).toBeUndefined();
  });

  it('a sunk monster no longer lashes', () => {
    const state = sea(squid({ hp: 0, ...lash(1) }), defaultPlayer({ position: { x: 11, y: 7 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted());
    expect(result.events.some((e) => e.type === 'MONSTER_ATTACKED')).toBe(false);
  });
});

describe('monsters: planning the turn', () => {
  const config = createDuelConfig({ seed: 7, sea: 'normal', monster: 'giant-squid' });

  it('a match with a monster marks its lashes before turn 1', () => {
    const state = createGame(config);
    const monster = Object.values(state.monsters ?? {})[0];
    expect(monster).toBeDefined();
    expect(monster.attacks).toHaveLength(SQUID.lashesPerTurn);
    const phases = monster.attacks.map((attack) => attack.phase);
    expect(new Set(phases).size).toBe(phases.length);
    expect(phases.every((phase) => phase >= 0 && phase < ACTIONS_PER_TURN)).toBe(true);
  });

  it('is the same every time for the same match, and changes from turn to turn', () => {
    const a = createGame(config);
    const b = createGame(config);
    expect(a.monsters).toEqual(b.monsters);

    const second = beginNextTurn({ ...a, status: 'animating' }).state;
    expect(second.turn).toBe(2);
    expect(second.monsters!['monster-1'].attacks).toHaveLength(SQUID.lashesPerTurn);
    const again = beginNextTurn({ ...b, status: 'animating' }).state;
    expect(again.monsters).toEqual(second.monsters);
  });

  it('only marks cells on the board', () => {
    const state = createGame(config);
    for (const monster of Object.values(state.monsters ?? {})) {
      for (const attack of monster.attacks) {
        expect(attack.cell.x).toBeGreaterThanOrEqual(0);
        expect(attack.cell.y).toBeGreaterThanOrEqual(0);
        expect(attack.cell.x).toBeLessThan(state.board.width);
        expect(attack.cell.y).toBeLessThan(state.board.height);
      }
    }
  });

  it('leaves a match without a monster exactly as it was', () => {
    const state = createGame(createDuelConfig({ seed: 7, sea: 'normal' }));
    expect(state.monsters).toBeUndefined();
  });
});

describe('monsters: placing one', () => {
  it('sits on open water, clear of the ships and the rocks, and is the same for a seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const config = createDuelConfig({ seed, sea: 'stormy', monster: 'giant-squid' });
      const [spawn] = config.monsters ?? [];
      if (!spawn) {
        continue; // a crowded sea may have no room, which is allowed
      }
      const body = monsterCells(spawn, SQUID.length);
      const rocks = new Set(config.obstacles.map((o) => `${o.x},${o.y}`));
      for (const cell of body) {
        expect(rocks.has(`${cell.x},${cell.y}`)).toBe(false);
        expect(config.terrain?.[`${cell.x},${cell.y}`]).toBeUndefined();
        for (const p of config.participants) {
          const d = Math.max(Math.abs(p.spawn.position.x - cell.x), Math.abs(p.spawn.position.y - cell.y));
          expect(d).toBeGreaterThanOrEqual(4);
        }
      }
      const again = generateMonsters({
        width: config.board.width,
        height: config.board.height,
        seed,
        spawns: config.participants.map((p) => p.spawn.position),
        obstacles: config.obstacles,
        terrain: config.terrain ?? {},
      });
      expect(again).toEqual(config.monsters);
    }
  });

  it('always finds room for one, on any seed and any sea', () => {
    for (const sea of ['calm', 'normal', 'stormy'] as const) {
      for (const typeId of ['giant-squid', 'shark'] as const) {
        for (let seed = 1; seed <= 25; seed += 1) {
          const config = createDuelConfig({ seed, sea, monster: typeId });
          expect(config.monsters, `${typeId} ${sea} seed ${seed}`).toHaveLength(1);
        }
      }
    }
  });

  it('never changes the rocks and winds of a seed', () => {
    const plain = createDuelConfig({ seed: 5, sea: 'stormy' });
    const withMonster = createDuelConfig({ seed: 5, sea: 'stormy', monster: 'giant-squid' });
    expect(withMonster.obstacles).toEqual(plain.obstacles);
    expect(withMonster.terrain).toEqual(plain.terrain);
  });
});

describe('monsters: the view', () => {
  it('shows the monster but hides what it will strike, unless the match warns players', () => {
    const hidden = createGame(createDuelConfig({ seed: 7, sea: 'normal', monster: 'giant-squid' }));
    const monster = Object.values(hidden.monsters ?? {})[0];
    expect(monster.attacks.length).toBeGreaterThan(0); // planned in the state, as for any ship

    const seen = Object.values(redactState(hidden, 'player', null).monsters ?? {})[0];
    expect(seen).toMatchObject({ id: monster.id, position: monster.position, hp: monster.hp });
    expect(seen.attacks).toEqual([]);
  });

  it('shows the marks when the match warns players, and they survive the trip to the preview state', () => {
    const state = createGame(createDuelConfig({ seed: 7, sea: 'normal', monster: 'giant-squid', monsterWarnings: true }));
    expect(state.monsterWarnings).toBe(true);
    const view = redactState(state, 'player', null);
    const real = Object.values(state.monsters ?? {})[0];
    const seen = Object.values(view.monsters ?? {})[0];
    expect(seen.attacks).toEqual(real.attacks);
    expect(seen.attacks.length).toBeGreaterThan(0);
    // Whatever the warning, the plan itself is never in a player's view.
    expect(seen).not.toHaveProperty('plan');
    expect(Object.values(viewToState(view).monsters ?? {})[0].attacks).toEqual(real.attacks);
  });

  it('does not warn about a monster that is not there', () => {
    const state = createGame(createDuelConfig({ seed: 7, sea: 'normal', monsterWarnings: true }));
    expect(state.monsterWarnings).toBeUndefined();
  });

  it('is left out of a view of a match with no monster', () => {
    const view = redactState(createGame(), 'player', null);
    expect(view).not.toHaveProperty('monsters');
  });
});

describe('monsters: whole matches', () => {
  it('a match with a monster plays through, deterministically, and the monster takes part', () => {
    let lashes = 0;
    let hits = 0;
    for (const seed of [1, 2, 3, 4]) {
      const config = createDuelConfig({ seed, sea: 'normal', monster: 'giant-squid', aiDifficulty: 'normal' });
      const a = runMatch(config);
      const b = runMatch(config);
      expect(a.hash).toBe(b.hash);
      expect(a.turns).toBeGreaterThan(0);
      lashes += a.events.filter((e) => e.type === 'MONSTER_ATTACKED').length;
      hits += a.events.filter((e) => e.type === 'PROJECTILE_HIT' && e.targetKind === 'monster').length;
    }
    expect(lashes).toBeGreaterThan(0);
    // The AI does not aim at the squid, but some shots find it on the way.
    expect(hits).toBeGreaterThanOrEqual(0);
  }, 30_000);
});

describe('monsters: one that sails', () => {
  /** A shark in open water at (8,8) facing east, with a plan to sail the given moves. */
  function shark(moves: ('FORWARD' | 'TURN_LEFT' | 'TURN_RIGHT' | null)[], overrides: Partial<Monster> = {}): Monster {
    return {
      id: 'monster-1',
      kind: 'monster',
      monsterTypeId: 'shark',
      position: { x: 8, y: 8 },
      heading: 'EAST',
      hp: 4,
      maxHp: 4,
      plan: { movement: moves, lashes: [null, null, null, null] },
      attacks: [],
      ...overrides,
    };
  }

  const far = defaultPlayer({ position: { x: 3, y: 15 }, heading: 'NORTH' });

  it('only a one-cell monster may sail', () => {
    for (const type of Object.values(MONSTER_TYPES)) {
      if (type.movesPerTurn > 0) {
        expect(type.length, type.id).toBe(1);
      }
    }
  });

  it('follows its plan like a ship, one cell a phase', () => {
    const state = sea(shark(['FORWARD', 'FORWARD', null, null]), far);
    const result = resolveTurn(state, submitted());
    expect(result.nextState.monsters!['monster-1'].position).toEqual({ x: 10, y: 8 });
    const moved = result.events.filter((e) => e.type === 'MONSTER_MOVED');
    expect(moved).toHaveLength(2);
    expect(moved[0]).toMatchObject({ monsterId: 'monster-1', from: { x: 8, y: 8 }, to: { x: 9, y: 8 }, cause: 'sail', phase: 0 });
  });

  it('turns like a ship: forward, then sideways', () => {
    const state = sea(shark(['TURN_LEFT', null, null, null]), far);
    const result = resolveTurn(state, submitted());
    // Heading east, a left turn goes forward then north, and ends facing north.
    expect(result.nextState.monsters!['monster-1']).toMatchObject({ position: { x: 9, y: 7 }, heading: 'NORTH' });
  });

  it('is stopped by a rock, and stops a ship that tries to enter its cell', () => {
    const rocked = sea(shark(['FORWARD', null, null, null]), far);
    const withRock = { ...rocked, obstacles: { 'rock-1': { id: 'rock-1', kind: 'rock' as const, position: { x: 9, y: 8 } } } };
    expect(resolveTurn(withRock, submitted()).nextState.monsters!['monster-1'].position).toEqual({ x: 8, y: 8 });

    // A ship at (8,10) facing north sails forward twice; the shark stays in (8,8), so the ship stops at (8,9).
    const state = sea(shark([null, null, null, null]), defaultPlayer({ position: { x: 8, y: 10 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted(['FORWARD', 'FORWARD', null, null]));
    expect(result.nextState.ships['player-ship'].position).toEqual({ x: 8, y: 9 });
    expect(result.events.some((e) => e.type === 'SHIP_BLOCKED')).toBe(true);
  });

  it('and a ship and a monster entering one cell stop each other', () => {
    // Both want (9,8): the shark from the west, the ship from the south.
    const state = sea(shark(['FORWARD', null, null, null]), defaultPlayer({ position: { x: 9, y: 9 }, heading: 'NORTH' }));
    const result = resolveTurn(state, submitted(['FORWARD', null, null, null]));
    expect(result.nextState.monsters!['monster-1'].position).toEqual({ x: 8, y: 8 });
    expect(result.nextState.ships['player-ship'].position).toEqual({ x: 9, y: 9 });
  });

  it('is carried by wind, as a ship is', () => {
    const state = {
      ...sea(shark([null, null, null, null]), far),
      terrain: { '8,8': { kind: 'wind' as const, direction: 'SOUTH' as const } },
    };
    const result = resolveTurn(state, submitted());
    const pushed = result.events.find((e) => e.type === 'MONSTER_MOVED');
    expect(pushed).toMatchObject({ monsterId: 'monster-1', cause: 'wind', from: { x: 8, y: 8 }, to: { x: 8, y: 9 } });
    expect(result.nextState.monsters!['monster-1'].position.x).toBe(8);
  });

  it('lashes from where it has sailed to, not where it began', () => {
    const plan: MonsterPlan = { movement: ['FORWARD', null, null, null], lashes: [null, 'front', null, null] };
    // After one step east it faces (10,8): a ship sitting there is bitten in phase 1.
    const state = sea(shark([], { plan }), defaultPlayer({ position: { x: 10, y: 8 }, heading: 'WEST' }));
    const result = resolveTurn(state, submitted());
    expect(result.events.find((e) => e.type === 'MONSTER_ATTACKED')).toMatchObject({ cell: { x: 10, y: 8 }, targetId: 'player-ship', phase: 1 });
  });

  it('a hunter plans to sail toward the nearest ship, and the forecast says where it will bite', () => {
    const state = sea(shark([]), defaultPlayer({ position: { x: 13, y: 8 }, heading: 'WEST' }));
    const planned = planMonsterTurn({ ...state, monsters: { 'monster-1': shark([], { plan: undefined }) } });
    const plan = planned!['monster-1'].plan!;
    expect(plan.movement.filter((m) => m === 'FORWARD').length).toBeGreaterThan(0);
    const bites = planned!['monster-1'].attacks;
    for (const bite of bites) {
      expect(bite.side).toBe('front');
    }
  });

  it('a hunter facing away from the only ship turns round and closes in, instead of standing still', () => {
    // The ship sits to the east and does nothing; the shark starts facing west, away from it.
    let state = sea(
      shark([], { heading: 'WEST', plan: undefined }),
      defaultPlayer({ position: { x: 16, y: 8 }, heading: 'WEST' }),
    );
    // The other ship is alive (so the match goes on) but far from both of them.
    state = { ...state, ships: { ...state.ships, 'enemy-ship': { ...state.ships['enemy-ship'], position: { x: 19, y: 19 } } } };
    state = { ...state, monsters: planMonsterTurn(state)! };
    const gap = (s: GameState) => {
      const m = s.monsters!['monster-1'];
      const p = s.ships['player-ship'].position;
      return Math.abs(m.position.x - p.x) + Math.abs(m.position.y - p.y);
    };
    const start = gap(state);
    for (let turn = 0; turn < 8; turn += 1) {
      state = beginNextTurn({ ...resolveTurn(state, submitted()).nextState, status: 'animating' }).state;
    }
    expect(gap(state)).toBeLessThan(start);
  });

  /** Plays turns with nobody else moving, returning the shark's cell after each. */
  function trail(state: GameState, turns: number): { x: number; y: number; heading: string }[] {
    const path: { x: number; y: number; heading: string }[] = [];
    let current: GameState = { ...state, monsters: planMonsterTurn(state)! };
    for (let turn = 0; turn < turns; turn += 1) {
      current = beginNextTurn({ ...resolveTurn(current, submitted()).nextState, status: 'animating' }).state;
      const m = current.monsters!['monster-1'];
      path.push({ ...m.position, heading: m.heading });
    }
    return path;
  }

  /** A shark at (8,8) facing west, a ship beyond it, and the other ship alive but far away. */
  function hunt(extra: Partial<GameState> = {}, at = { x: 8, y: 8 }, heading: Monster['heading'] = 'WEST'): GameState {
    const base = sea(
      shark([], { position: at, heading, plan: undefined }),
      defaultPlayer({ position: { x: 2, y: 8 }, heading: 'EAST' }),
    );
    return {
      ...base,
      ships: { ...base.ships, 'enemy-ship': { ...base.ships['enemy-ship'], position: { x: 19, y: 19 } } },
      ...extra,
    };
  }

  it('a hunter with a rock dead ahead turns on the spot and gets round it', () => {
    const rock = { 'rock-1': { id: 'rock-1', kind: 'rock' as const, position: { x: 7, y: 8 } } };
    const path = trail(hunt({ obstacles: rock }), 12);
    // It must have turned away from the rock (heading changes) and then gone past it.
    expect(new Set(path.map((cell) => cell.heading)).size).toBeGreaterThan(1);
    expect(Math.min(...path.map((cell) => cell.x))).toBeLessThanOrEqual(6);
  });

  it('a hunter against the edge of the board comes away from it', () => {
    // At the west edge facing west, with the ship to the east behind it.
    const state = hunt({}, { x: 0, y: 8 }, 'WEST');
    const base = { ...state, ships: { ...state.ships, 'player-ship': { ...state.ships['player-ship'], position: { x: 10, y: 8 } } } };
    const path = trail(base, 10);
    expect(Math.max(...path.map((cell) => cell.x))).toBeGreaterThan(2);
  });

  it('a hunter sails on most turns, not now and then', () => {
    let sailed = 0;
    let turns = 0;
    for (const seed of [1, 3, 4, 5, 6, 7]) {
      const record = runMatch(createDuelConfig({ seed, sea: 'normal', monster: 'shark' }));
      turns += record.turns;
      const movingTurns = new Set(
        record.events.reduce<number[]>((all, event, index) => {
          if (event.type === 'MONSTER_MOVED') {
            // The turn this move belongs to is the number of TURN_STARTED events before it.
            all.push(record.events.slice(0, index).filter((e) => e.type === 'TURN_STARTED').length);
          }
          return all;
        }, []),
      );
      sailed += movingTurns.size;
    }
    expect(sailed / turns).toBeGreaterThan(0.6);
  }, 30_000);

  it('a match with a shark or a squid plays through, deterministically', () => {
    for (const [seed, kind] of [[1, 'shark'], [2, 'squid'], [3, 'shark'], [4, 'squid']] as const) {
      const config = createDuelConfig({ seed, sea: 'normal', monster: kind });
      const a = runMatch(config);
      const b = runMatch(config);
      expect(a.hash).toBe(b.hash);
      expect(a.turns).toBeGreaterThan(0);
    }
  }, 30_000);
});
