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
    expect(buildMatchResult(done)?.hunt).toEqual({ ending: 'left', bossSlain: false, monstersSunk: 0 });
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
