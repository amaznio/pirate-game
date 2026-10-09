import { describe, expect, it } from 'vitest';
import {
  AI_DIFFICULTIES,
  type AiDifficulty,
  type GameState,
} from '../../domain/GameState';
import type { TokenInventory } from '../../domain/Action';
import type { Direction } from '../../domain/Direction';
import { pos } from '../../domain/Position';
import {
  createDuelConfig,
  createSkirmishConfig,
} from '../../config/matchConfig';
import { createGame } from '../../simulation/createGame';
import { resolveTurn } from '../../simulation/resolveTurn';
import { beginNextTurn, spendMovementTokens } from '../../simulation/tokens';
import { createSimpleAI, planAiActions } from '../simpleAI';
import { AI_PROFILES } from '../profiles';
import { createRng } from '../rng';

const idle = { movement: [null, null, null, null], cannons: Array.from({ length: 4 }, () => ({ left: false, right: false })) };

const distance = (state: GameState) => {
  const a = state.ships['enemy-ship'].position;
  const b = state.ships['player-ship'].position;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

function duelState(level: AiDifficulty, seed = 1): GameState {
  return createGame(createDuelConfig({ aiDifficulty: level, seed }));
}

/** The enemy AI plays against a player who never moves. */
function playAgainstIdle(level: AiDifficulty, turns: number, seed = 1) {
  let state = duelState(level, seed);
  const distances: number[] = [distance(state)];
  let sunkOn: number | null = null;

  for (let turn = 1; turn <= turns; turn += 1) {
    const plan = planAiActions(state, 'enemy');
    const players = {
      ...state.players,
      enemy: {
        ...state.players.enemy,
        tokens: spendMovementTokens(state.players.enemy.tokens, plan.movement),
      },
    };
    const result = resolveTurn({ ...state, players }, { enemy: plan, player: idle });
    distances.push(distance(result.nextState));
    if (result.nextState.outcome) {
      sunkOn = turn;
      break;
    }
    state = beginNextTurn({ ...result.nextState, status: 'animating' }).state;
  }
  return { distances, sunkOn };
}

/** Two AIs fight a whole duel; returns each side's hull when it ends. */
function fight(playerLevel: AiDifficulty, enemyLevel: AiDifficulty, seed: number) {
  const base = createGame(createDuelConfig({ seed }));
  let state: GameState = {
    ...base,
    players: {
      player: { ...base.players.player, controller: 'ai', aiDifficulty: playerLevel },
      enemy: { ...base.players.enemy, aiDifficulty: enemyLevel },
    },
  };
  for (let turn = 1; turn <= 40; turn += 1) {
    const plans = {
      player: planAiActions(state, 'player'),
      enemy: planAiActions(state, 'enemy'),
    };
    const players = {
      player: {
        ...state.players.player,
        tokens: spendMovementTokens(state.players.player.tokens, plans.player.movement),
      },
      enemy: {
        ...state.players.enemy,
        tokens: spendMovementTokens(state.players.enemy.tokens, plans.enemy.movement),
      },
    };
    state = resolveTurn({ ...state, players }, plans).nextState;
    if (state.outcome) {
      break;
    }
    state = beginNextTurn({ ...state, status: 'animating' }).state;
  }
  return {
    player: state.ships['player-ship'].hp,
    enemy: state.ships['enemy-ship'].hp,
  };
}

/** Wins for `a` and for `b` over several seeds, each side played both ways round. */
function matchup(a: AiDifficulty, b: AiDifficulty, seeds: number[]) {
  let aWins = 0;
  let bWins = 0;
  for (const seed of seeds) {
    const first = fight(a, b, seed);
    const second = fight(b, a, seed);
    if (first.player > first.enemy) aWins += 1;
    if (first.enemy > first.player) bWins += 1;
    if (second.enemy > second.player) aWins += 1;
    if (second.player > second.enemy) bWins += 1;
  }
  return { aWins, bWins };
}

const SEEDS = [1, 2, 3, 4, 5, 6];

describe('movement economy', () => {
  const withPool = (pool: Partial<TokenInventory>, level: AiDifficulty = 'normal') => {
    const base = duelState(level);
    return {
      ...base,
      players: {
        ...base.players,
        enemy: {
          ...base.players.enemy,
          tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0, ...pool },
        },
      },
    };
  };

  it('holds when it has no movement tokens', () => {
    for (const level of AI_DIFFICULTIES) {
      expect(planAiActions(withPool({}, level), 'enemy').movement).toEqual([
        null,
        null,
        null,
        null,
      ]);
    }
  });

  it('never plans more of a token than it holds', () => {
    const pools: Array<Partial<TokenInventory>> = [
      { FORWARD: 1 },
      { FORWARD: 2 },
      { FORWARD: 1, TURN_LEFT: 1 },
      { TURN_LEFT: 1, TURN_RIGHT: 1 },
      { FORWARD: 3, TURN_LEFT: 2, TURN_RIGHT: 1 },
    ];
    for (const level of AI_DIFFICULTIES) {
      for (const pool of pools) {
        const plan = planAiActions(withPool(pool, level), 'enemy');
        for (const action of ['FORWARD', 'TURN_LEFT', 'TURN_RIGHT'] as const) {
          const used = plan.movement.filter((slot) => slot === action).length;
          expect(used).toBeLessThanOrEqual(pool[action] ?? 0);
        }
      }
    }
  });

  it('does not plan a move that would do nothing', () => {
    const base = duelState('normal');
    // Boxed against the top edge heading north: FORWARD goes nowhere.
    const state: GameState = {
      ...base,
      ships: {
        ...base.ships,
        'enemy-ship': {
          ...base.ships['enemy-ship'],
          position: pos(9, 0),
          heading: 'NORTH',
        },
      },
      players: {
        ...base.players,
        enemy: {
          ...base.players.enemy,
          tokens: { FORWARD: 4, TURN_LEFT: 0, TURN_RIGHT: 0 },
        },
      },
    };

    expect(planAiActions(state, 'enemy').movement).toEqual([null, null, null, null]);
  });

  it('plays at most as many moves as its difficulty allows', () => {
    const easy = planAiActions(withPool({ FORWARD: 4, TURN_LEFT: 4, TURN_RIGHT: 4 }, 'easy'), 'enemy');
    const hard = planAiActions(withPool({ FORWARD: 4, TURN_LEFT: 4, TURN_RIGHT: 4 }, 'hard'), 'enemy');
    const moves = (plan: typeof easy) => plan.movement.filter(Boolean).length;

    expect(moves(easy)).toBeLessThanOrEqual(AI_PROFILES.easy.maxMoves);
    expect(moves(hard)).toBeLessThanOrEqual(AI_PROFILES.hard.maxMoves);
  });
});

describe('going after a target', () => {
  it.each(AI_DIFFICULTIES)('%s closes in on a ship that does not move and sinks it', (level) => {
    const { distances, sunkOn } = playAgainstIdle(level, 15);

    expect(sunkOn).not.toBeNull();
    expect(sunkOn).toBeLessThanOrEqual(12);
    expect(Math.min(...distances)).toBeLessThanOrEqual(4);
  });

  it.each(AI_DIFFICULTIES)('%s never ends up far from its target (it does not run away)', (level) => {
    const { distances } = playAgainstIdle(level, 15);
    const start = distances[0];

    for (const value of distances.slice(1)) {
      expect(value).toBeLessThanOrEqual(start);
    }
  });

  it('keeps hunting from another start (not only the one spot it was tuned on)', () => {
    for (const seed of [2, 3, 4]) {
      const base = duelState('normal', seed);
      const flipped: GameState = {
        ...base,
        ships: {
          ...base.ships,
          'enemy-ship': {
            ...base.ships['enemy-ship'],
            position: pos(3, 4),
            heading: 'EAST',
          },
          'player-ship': {
            ...base.ships['player-ship'],
            position: pos(15, 15),
            heading: 'WEST',
          },
        },
      };
      let state = flipped;
      let sunk = false;
      for (let turn = 1; turn <= 20 && !sunk; turn += 1) {
        const plan = planAiActions(state, 'enemy');
        const players = {
          ...state.players,
          enemy: {
            ...state.players.enemy,
            tokens: spendMovementTokens(state.players.enemy.tokens, plan.movement),
          },
        };
        const result = resolveTurn({ ...state, players }, { enemy: plan, player: idle });
        sunk = result.nextState.outcome !== null;
        state = beginNextTurn({ ...result.nextState, status: 'animating' }).state;
      }
      expect(sunk).toBe(true);
    }
  });

  /** The enemy sits level with the player, who is 2 cells to its left. */
  const besideTarget = (level: AiDifficulty, turn = 1): GameState => {
    const base = duelState(level);
    return {
      ...base,
      turn,
      obstacles: {},
      ships: {
        ...base.ships,
        'enemy-ship': { ...base.ships['enemy-ship'], position: pos(10, 10), heading: 'NORTH' },
        'player-ship': { ...base.ships['player-ship'], position: pos(8, 10), heading: 'NORTH' },
      },
    };
  };

  it('normal stays put and keeps firing once it is beside its target (bar the odd slip)', () => {
    let held = 0;
    for (let turn = 1; turn <= 20; turn += 1) {
      const plan = planAiActions(besideTarget('normal', turn), 'enemy');
      if (plan.movement.every((slot) => slot === null)) {
        held += 1;
        expect(plan.cannons.some((slot) => slot.left)).toBe(true);
      }
    }

    expect(held).toBeGreaterThanOrEqual(14);
  });

  it('hard keeps shooting but steps out of the target line of fire', () => {
    const state = besideTarget('hard');

    const plan = planAiActions(state, 'enemy');
    const result = resolveTurn(state, { enemy: plan, player: idle });
    const end = result.nextState.ships['enemy-ship'].position;

    const shots = plan.cannons.reduce((total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0), 0);
    expect(shots).toBeGreaterThanOrEqual(2);
    // The player faces north: its guns cover row 10 within 3 cells either side.
    // Staying at (10, 10) would be inside that line; hard moves out of it.
    expect(end.y === 10 && end.x >= 5 && end.x <= 11).toBe(false);
  });

  it('does not fire more shots than it has cannonballs', () => {
    const base = duelState('hard');
    const state: GameState = {
      ...base,
      obstacles: {},
      ships: {
        ...base.ships,
        'enemy-ship': { ...base.ships['enemy-ship'], position: pos(10, 10), heading: 'NORTH' },
        'player-ship': { ...base.ships['player-ship'], position: pos(8, 10), heading: 'NORTH' },
      },
      players: {
        ...base.players,
        enemy: { ...base.players.enemy, ammo: 1 },
      },
    };

    const plan = planAiActions(state, 'enemy');
    const shots = plan.cannons.reduce((total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0), 0);

    expect(shots).toBe(1);
  });

  it('turns to get beside a target that is straight ahead, when it has the tokens', () => {
    const base = duelState('hard');
    const state: GameState = {
      ...base,
      obstacles: {},
      ships: {
        ...base.ships,
        'enemy-ship': { ...base.ships['enemy-ship'], position: pos(10, 6), heading: 'SOUTH' },
        'player-ship': { ...base.ships['player-ship'], position: pos(10, 9), heading: 'NORTH' },
      },
      players: {
        ...base.players,
        enemy: { ...base.players.enemy, tokens: { FORWARD: 3, TURN_LEFT: 3, TURN_RIGHT: 3 } },
      },
    };

    const plan = planAiActions(state, 'enemy');

    expect(plan.movement.some((slot) => slot === 'TURN_LEFT' || slot === 'TURN_RIGHT')).toBe(true);
  });

  it('prefers the nearest enemy among several, and passes when none are left', () => {
    const config = createSkirmishConfig({ humans: 2, ais: 2, teamMode: 'teams' });
    const base = createGame(config);
    const place = (id: string, x: number, y: number, heading: Direction, hp?: number) => ({
      ...base.ships[`${id}-ship`],
      position: pos(x, y),
      heading,
      ...(hp === undefined ? {} : { hp }),
    });
    const arena = (hostileHp: number): GameState => ({
      ...base,
      obstacles: {},
      ships: {
        'p1-ship': place('p1', 7, 10, 'SOUTH', hostileHp),
        'p2-ship': place('p2', 10, 10, 'NORTH'),
        'p3-ship': place('p3', 17, 17, 'NORTH', hostileHp),
        'p4-ship': place('p4', 13, 10, 'NORTH'),
      },
      players: {
        ...base.players,
        p2: { ...base.players.p2, tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 } },
      },
    });

    expect(planAiActions(arena(4), 'p2').cannons.some((slot) => slot.left)).toBe(true);
    // p4 is a teammate on the right: it is never shot at.
    expect(planAiActions(arena(4), 'p2').cannons.some((slot) => slot.right)).toBe(false);
    expect(planAiActions(arena(0), 'p2')).toEqual({ movement: [], cannons: [] });
  });
});

describe('difficulty', () => {
  it('has a profile for every level, and harder means better play', () => {
    expect(Object.keys(AI_PROFILES).sort()).toEqual([...AI_DIFFICULTIES].sort());
    expect(AI_PROFILES.hard.mistakeRate).toBeLessThan(AI_PROFILES.normal.mistakeRate);
    expect(AI_PROFILES.normal.mistakeRate).toBeLessThan(AI_PROFILES.easy.mistakeRate);
    expect(AI_PROFILES.easy.fireChance).toBeLessThan(AI_PROFILES.normal.fireChance);
    expect(AI_PROFILES.easy.maxMoves).toBeLessThan(AI_PROFILES.normal.maxMoves);
    expect(AI_PROFILES.hard.dangerWeight).toBeGreaterThan(AI_PROFILES.normal.dangerWeight);
  });

  it('uses the difficulty stored on the player when none is given', () => {
    const state = duelState('easy');

    expect(planAiActions(state, 'enemy')).toEqual(planAiActions(state, 'enemy', 'easy'));
    expect(createSimpleAI().chooseActions(state, 'enemy')).toEqual(
      planAiActions(state, 'enemy', 'easy'),
    );
  });

  it('lets a caller override the stored difficulty', () => {
    const state = duelState('easy');

    expect(planAiActions(state, 'enemy', 'hard')).toEqual(
      planAiActions(duelState('hard'), 'enemy'),
    );
  });

  it('plays the same plan for the same situation, every time', () => {
    for (const level of AI_DIFFICULTIES) {
      const state = duelState(level);
      expect(planAiActions(state, 'enemy')).toEqual(planAiActions(state, 'enemy'));
    }
  });

  it('makes different mistakes on different turns', () => {
    const base = duelState('easy');
    const plans = new Set<string>();
    for (let turn = 1; turn <= 12; turn += 1) {
      plans.add(JSON.stringify(planAiActions({ ...base, turn }, 'enemy').movement));
    }

    expect(plans.size).toBeGreaterThan(1);
  });

  it('hard beats easy, normal beats easy, and hard beats normal over whole matches', () => {
    const hardVsEasy = matchup('hard', 'easy', SEEDS);
    const normalVsEasy = matchup('normal', 'easy', SEEDS);
    const hardVsNormal = matchup('hard', 'normal', SEEDS);

    expect(hardVsEasy.aWins).toBeGreaterThan(hardVsEasy.bWins);
    expect(normalVsEasy.aWins).toBeGreaterThan(normalVsEasy.bWins);
    expect(hardVsNormal.aWins).toBeGreaterThan(hardVsNormal.bWins);
  });

  it('is even when the same level plays itself (no built-in advantage for a side)', () => {
    const { aWins, bWins } = matchup('normal', 'normal', SEEDS);

    expect(Math.abs(aWins - bWins)).toBeLessThanOrEqual(3);
  });
});

describe('createRng', () => {
  it('gives the same numbers for the same inputs', () => {
    const a = createRng(1, 3, 'enemy');
    const b = createRng(1, 3, 'enemy');

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gives different numbers for a different turn, player or seed', () => {
    const first = createRng(1, 3, 'enemy')();

    expect(createRng(1, 4, 'enemy')()).not.toBe(first);
    expect(createRng(1, 3, 'player')()).not.toBe(first);
    expect(createRng(2, 3, 'enemy')()).not.toBe(first);
  });

  it('stays within 0 and 1 and is spread out', () => {
    const rng = createRng(7, 1, 'p1');
    const values = Array.from({ length: 2000 }, () => rng());

    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
