import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { Monster } from '../../domain/Monster';
import { monsterCells } from '../../domain/Monster';
import { EXIT_DEPTH, MONSTER_TEAM_ID } from '../../domain/Objective';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../config/gameRules';
import { getMonsterType } from '../../config/monsterTypes';
import { HUNT_BOSS_ID, createHuntConfig } from '../../config/matchConfig';
import { createBoard } from '../../domain/Board';
import { cellKey } from '../../domain/Terrain';
import { createGame } from '../createGame';
import { inExitArea } from '../escapes';
import { buildMatchResult } from '../matchResult';
import { evaluateOutcome, resolveTurn } from '../resolveTurn';
import { damageMonster } from '../monsters';
import { applyPlayerPlan } from '../plans';
import { parsePlayerActions } from '../../protocol/validate';
import { runMatch } from '../../testing/matchRunner';
import { submitted } from './testUtils';

const hunt = (seed = 1) => createGame(createHuntConfig({ seed, sea: 'normal' }));

/** The hunt with the hero's ship replaced by `ship`. */
function withHero(state: GameState, change: object): GameState {
  const ship = state.ships['player-ship'];
  return { ...state, ships: { ...state.ships, 'player-ship': { ...ship, ...change } } };
}

describe('hunt: the match', () => {
  it('is one human against the monsters, with the giant squid as the boss and no enemy ship', () => {
    const config = createHuntConfig({ seed: 3 });
    expect(config.participants).toHaveLength(1);
    expect(config.participants[0]).toMatchObject({ playerId: 'player', controller: 'human' });
    expect(config.objective).toEqual({ kind: 'hunt', exit: 'SOUTH', bossId: HUNT_BOSS_ID });
    expect((config.monsters ?? []).map((m) => m.typeId)).toEqual(['giant-squid', 'squid', 'shark']);
    expect(config.monsters?.[0].id).toBe(HUNT_BOSS_ID);
  });

  it('starts the hero just inside the south edge, beside the exit, and keeps the exit strip clear', () => {
    for (const sea of ['calm', 'normal', 'stormy'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const config = createHuntConfig({ seed, sea });
        const start = config.participants[0].spawn.position;
        expect(start.y, `${sea} ${seed}`).toBe(BOARD_HEIGHT - 1 - EXIT_DEPTH);
        const monsterCellKeys = new Set(
          (config.monsters ?? []).flatMap((m) => monsterCells(m, getMonsterType(m.typeId).length).map(cellKey)),
        );
        for (let y = BOARD_HEIGHT - EXIT_DEPTH; y < BOARD_HEIGHT; y += 1) {
          for (let x = 0; x < BOARD_WIDTH; x += 1) {
            expect(config.obstacles.some((o) => o.x === x && o.y === y), `rock ${x},${y} ${sea} ${seed}`).toBe(false);
            expect(config.terrain?.[cellKey({ x, y })], `hazard ${x},${y} ${sea} ${seed}`).toBeUndefined();
            expect(monsterCellKeys.has(cellKey({ x, y })), `monster ${x},${y} ${sea} ${seed}`).toBe(false);
          }
        }
      }
    }
  });

  it('is the same match for the same seed', () => {
    expect(createHuntConfig({ seed: 5 })).toEqual(createHuntConfig({ seed: 5 }));
  });

  it('knows which cells are the exit area', () => {
    const board = createBoard(20, 20);
    expect(inExitArea(board, 'SOUTH', { x: 5, y: 19 }, 2)).toBe(true);
    expect(inExitArea(board, 'SOUTH', { x: 5, y: 18 }, 2)).toBe(true);
    expect(inExitArea(board, 'SOUTH', { x: 5, y: 17 }, 2)).toBe(false);
    expect(inExitArea(board, 'NORTH', { x: 5, y: 1 }, 2)).toBe(true);
    expect(inExitArea(board, 'EAST', { x: 18, y: 5 }, 2)).toBe(true);
    expect(inExitArea(board, 'WEST', { x: 2, y: 5 }, 2)).toBe(false);
  });
});

describe('hunt: how it ends', () => {
  it('does not end by itself: a lone hero afloat is not a win, and there is no turn limit', () => {
    const state = hunt();
    expect(evaluateOutcome(state, true)).toBeNull();
    let current = state;
    for (let turn = 0; turn < 12; turn += 1) {
      const result = resolveTurn(current, submitted());
      expect(result.nextState.outcome, `turn ${turn + 1}`).toBeNull();
      current = { ...result.nextState, turn: result.nextState.turn + 1, status: 'planning' };
    }
  });

  it('is won when the hero has left, with the reason', () => {
    const left = withHero(hunt(), { hp: 0, escaped: true });
    expect(evaluateOutcome(left, true)).toEqual({ kind: 'win', teamId: 'player', reason: 'left' });
  });

  it('is lost when the hero is sunk', () => {
    const sunk = withHero(hunt(), { hp: 0 });
    expect(evaluateOutcome(sunk, true)).toEqual({ kind: 'win', teamId: MONSTER_TEAM_ID, reason: 'objective_failed' });
  });

  it('is lost through a real turn when a monster lash sinks the hero', () => {
    const state = hunt();
    const hero = state.ships['player-ship'];
    // A giant squid whose bow cell is two above the hero, so its front cell is the hero's.
    const boss: Monster = {
      id: HUNT_BOSS_ID,
      kind: 'monster',
      monsterTypeId: 'giant-squid',
      position: { x: hero.position.x, y: hero.position.y - 2 },
      heading: 'SOUTH',
      hp: 10,
      maxHp: 10,
      attacks: [],
      plan: { movement: [null, null, null, null], lashes: ['front', null, null, null] },
    };
    // The bow is at (x, y-1), so its front is the hero's own cell.
    const setup = withHero({ ...state, monsters: { [HUNT_BOSS_ID]: boss } }, { hp: 2 });
    const result = resolveTurn(setup, submitted());
    expect(result.nextState.outcome).toEqual({ kind: 'win', teamId: MONSTER_TEAM_ID, reason: 'objective_failed' });
    expect(result.events.some((e) => e.type === 'GAME_ENDED')).toBe(true);
    expect(buildMatchResult(result.nextState)).toMatchObject({
      objective: { kind: 'hunt', met: false },
      hunt: { ending: 'sunk', bossSlain: false },
    });
  });
});

describe('hunt: the result', () => {
  it('says the hunt was left, and whether the boss was slain and how many monsters went down', () => {
    const state = hunt();
    const monsters = Object.fromEntries(
      Object.entries(state.monsters ?? {}).map(([id, m]) => [id, id === HUNT_BOSS_ID || m.monsterTypeId === 'shark' ? { ...m, hp: 0 } : m]),
    );
    const left = withHero({ ...state, monsters }, { hp: 0, escaped: true });
    const done = { ...left, outcome: evaluateOutcome(left, true), status: 'game_over' as const };
    expect(buildMatchResult(done)).toMatchObject({
      objective: { kind: 'hunt', met: true },
      hunt: { ending: 'left', bossSlain: true, monstersSunk: 2 },
    });
  });

  it('leaves the boss unslain when it is still afloat', () => {
    const left = withHero(hunt(), { hp: 0, escaped: true });
    const done = { ...left, outcome: evaluateOutcome(left, true), status: 'game_over' as const };
    expect(buildMatchResult(done)?.hunt).toEqual({ ending: 'left', bossSlain: false, monstersSunk: 0, haul: 0 });
  });
});

describe('hunt: played by the AI', () => {
  it('plays through, deterministically, with the hero going for the monsters', () => {
    const config = createHuntConfig({ seed: 2, sea: 'normal' });
    const a = runMatch(config, { maxTurns: 25 });
    const b = runMatch(config, { maxTurns: 25 });
    expect(a.hash).toBe(b.hash);
    expect(a.events.some((e) => e.type === 'MONSTER_ATTACKED' || e.type === 'PROJECTILE_HIT')).toBe(true);
  }, 60_000);
});

describe('hunt: treasure', () => {
  it('scatters plenty of chests on open water, clear of rocks, monsters and the exit', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const config = createHuntConfig({ seed, sea: 'normal' });
      const chests = Object.entries(config.pickups ?? {});
      expect(chests.length, `seed ${seed}`).toBeGreaterThanOrEqual(8);
      const monsterCellKeys = new Set(
        (config.monsters ?? []).flatMap((m) => monsterCells(m, getMonsterType(m.typeId).length).map(cellKey)),
      );
      for (const [key, pickup] of chests) {
        const [x, y] = key.split(',').map(Number);
        expect(pickup.kind).toBe('chest');
        expect(pickup.value ?? 0).toBeGreaterThan(0);
        expect(y, `exit ${key}`).toBeLessThan(BOARD_HEIGHT - EXIT_DEPTH);
        expect(config.obstacles.some((o) => o.x === x && o.y === y), `rock ${key}`).toBe(false);
        expect(config.terrain?.[key], `hazard ${key}`).toBeUndefined();
        expect(monsterCellKeys.has(key), `monster ${key}`).toBe(false);
      }
    }
  });

  it('adds a collected chest to the haul, not to the loot tally', () => {
    const state = hunt();
    const hero = state.ships['player-ship'];
    const cell = { x: hero.position.x, y: hero.position.y - 1 };
    const setup = {
      ...state,
      pickups: { [cellKey(cell)]: { kind: 'chest' as const, value: 3 } },
    };
    const sailing = resolveTurn(setup, submitted(['FORWARD', null, null, null]));
    const player = sailing.nextState.players['player'];
    expect(player.haul).toBe(3);
    expect(sailing.nextState.pickups?.[cellKey(cell)]).toBeUndefined();
    expect(sailing.nextState.pickupsTaken?.['player']).toBeUndefined();
  });

  it('drops chests where a monster is sunk, and only in a hunt', () => {
    const state = hunt();
    const boss = state.monsters![HUNT_BOSS_ID];
    const dying = { ...state, pickups: {}, monsters: { [HUNT_BOSS_ID]: { ...boss, hp: 1 } } };
    const cells = monsterCells(boss, getMonsterType('giant-squid').length);
    const next = structuredClone(dying) as GameState;
    damageMonster(next, HUNT_BOSS_ID, 5, 0);
    const chests = Object.values(next.pickups ?? {});
    expect(chests).toHaveLength(getMonsterType('giant-squid').boss!.drop.chests);
    expect(chests.every((c) => c.kind === 'chest' && c.value === 5)).toBe(true);
    expect(cells.every((c) => next.pickups?.[cellKey(c)])).toBe(true);

    const plain = structuredClone({ ...dying, objective: { kind: 'survive' as const, turns: 10 } }) as GameState;
    damageMonster(plain, HUNT_BOSS_ID, 5, 0);
    expect(Object.keys(plain.pickups ?? {})).toHaveLength(0);
  });

  it('banks the haul in the result when the hero leaves, and loses it when sunk', () => {
    const base = hunt();
    const loaded = {
      ...base,
      players: { ...base.players, player: { ...base.players['player'], haul: 7 } },
    };
    const left = withHero(loaded, { hp: 0, escaped: true });
    const won = { ...left, outcome: evaluateOutcome(left, true), status: 'game_over' as const };
    expect(buildMatchResult(won)?.hunt?.haul).toBe(7);
    const sunk = withHero(loaded, { hp: 0 });
    const lost = { ...sunk, outcome: evaluateOutcome(sunk, true), status: 'game_over' as const };
    expect(buildMatchResult(lost)?.hunt?.haul).toBe(0);
  });
});

describe('hunt: the boss', () => {
  it('is the giant squid, flagged, with the boss hull, and nothing else is a boss', () => {
    const monsters = hunt().monsters!;
    const boss = getMonsterType('giant-squid').boss!;
    expect(monsters[HUNT_BOSS_ID]).toMatchObject({ boss: true, hp: boss.maxHp, maxHp: boss.maxHp });
    expect(boss.maxHp).toBeGreaterThan(getMonsterType('giant-squid').maxHp);
    expect(Object.values(monsters).filter((m) => m.boss)).toHaveLength(1);
  });

  it('takes its hull from the hunt options, and only the boss does', () => {
    const state = createGame(createHuntConfig({ seed: 1, bossHull: 22 }));
    expect(state.monsters![HUNT_BOSS_ID]).toMatchObject({ hp: 22, maxHp: 22 });
    const squid = Object.values(state.monsters!).find((m) => m.monsterTypeId === 'squid')!;
    expect(squid.maxHp).toBe(getMonsterType('squid').maxHp);
  });

  it('is not a boss outside a hunt', () => {
    const config = { ...createHuntConfig({ seed: 1 }), objective: { kind: 'survive' as const, turns: 10 } };
    const boss = createGame(config).monsters![HUNT_BOSS_ID];
    expect(boss.boss).toBeUndefined();
    expect(boss.maxHp).toBe(getMonsterType('giant-squid').maxHp);
  });

  it('drops more than any other monster, and sinking it does not end the hunt', () => {
    const state = hunt();
    const drops = (id: string): number => {
      const next = structuredClone({ ...state, pickups: {} }) as GameState;
      damageMonster(next, id, 99, 0);
      return Object.values(next.pickups ?? {}).length;
    };
    const others = Object.keys(state.monsters!).filter((id) => id !== HUNT_BOSS_ID);
    for (const id of others) {
      expect(drops(HUNT_BOSS_ID)).toBeGreaterThan(drops(id));
    }
    const dead = {
      ...state,
      monsters: { ...state.monsters, [HUNT_BOSS_ID]: { ...state.monsters![HUNT_BOSS_ID], hp: 0 } },
    };
    expect(evaluateOutcome(dead, true)).toBeNull();
  });
});

describe('hunt: leaving', () => {
  const inExit = (state: GameState): GameState =>
    withHero(state, { position: { x: state.ships['player-ship'].position.x, y: BOARD_HEIGHT - 1 } });
  const withHaul = (state: GameState, haul: number): GameState => ({
    ...state,
    players: { ...state.players, player: { ...state.players['player'], haul } },
  });
  const leaving = { movement: [null, null, null, null], cannons: [], leave: true } as never;

  it('sails off with the haul when the hero chose to leave and ends the turn in the exit area', () => {
    const state = withHaul(inExit(hunt()), 6);
    const result = resolveTurn(state, { player: leaving });
    expect(result.events.some((e) => e.type === 'SHIP_ESCAPED')).toBe(true);
    expect(result.nextState.outcome).toEqual({ kind: 'win', teamId: 'player', reason: 'left' });
    expect(buildMatchResult(result.nextState)?.hunt).toMatchObject({ ending: 'left', haul: 6 });
  });

  it('reports the hull the hero left with, not the zero a departed ship is left at', () => {
    const state = inExit(hunt());
    const before = state.ships['player-ship'];
    const hurt = { ...state, ships: { ...state.ships, 'player-ship': { ...before, hp: 2 } } };
    const result = resolveTurn(hurt, { player: leaving });
    const mine = buildMatchResult(result.nextState)?.ships.find((ship) => ship.playerId === 'player');
    expect(result.nextState.ships['player-ship'].hp).toBe(0);
    expect(mine).toMatchObject({ hull: 2, maxHull: before.maxHp, afloat: false, escaped: true });
  });

  it('can leave with an empty hold', () => {
    const result = resolveTurn(inExit(hunt()), { player: leaving });
    expect(buildMatchResult(result.nextState)?.hunt).toMatchObject({ ending: 'left', haul: 0 });
  });

  it('stays when it did not choose to leave, or is not in the exit area', () => {
    const stays = resolveTurn(inExit(hunt()), submitted());
    expect(stays.nextState.outcome).toBeNull();
    const outside = resolveTurn(hunt(), { player: leaving });
    expect(outside.nextState.outcome).toBeNull();
    expect(outside.events.some((e) => e.type === 'SHIP_ESCAPED')).toBe(false);
  });

  it('is only a valid plan in a hunt, and the flag is cleared for the next turn', () => {
    const plan = { movement: [null, null, null, null], cannons: [], leave: true } as never;
    const emptyCannons = Array.from({ length: 4 }, () => ({ left: 0, right: 0 }));
    const real = { movement: [null, null, null, null], cannons: emptyCannons, leave: true } as never;
    expect(applyPlayerPlan(hunt(), 'player', plan).ok).toBe(false);
    const ok = applyPlayerPlan(hunt(), 'player', real);
    expect(ok.ok && ok.state.players['player'].leaving).toBe(true);
    const normal = createGame({ ...createHuntConfig({ seed: 1 }), objective: undefined, monsters: [] });
    expect(applyPlayerPlan(normal, 'player', real)).toEqual({ ok: false, reason: 'malformed_plan' });
    expect(parsePlayerActions({ movement: [null, null, null, null], cannons: emptyCannons, leave: true })?.leave).toBe(true);
    expect(parsePlayerActions({ movement: [null, null, null, null], cannons: emptyCannons, leave: 'yes' })).toBeNull();
  });
});

describe('hunt: where the monsters are put', () => {
  it('keeps the monsters well apart from one another', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const config = createHuntConfig({ seed, sea: 'normal' });
      const placed = (config.monsters ?? []).filter((spawn) => spawn.typeId !== 'tentacle');
      for (const a of placed) {
        for (const b of placed) {
          if (a !== b) {
            const gap = Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y));
            expect(gap).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });
});
