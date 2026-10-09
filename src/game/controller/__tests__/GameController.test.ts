import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../events/EventBus';
import { GameController } from '../GameController';
import { createGame } from '../../simulation/createGame';
import type { GameState } from '../../domain/GameState';
import type { PlayerActions } from '../../domain/TurnResult';
import { pos } from '../../domain/Position';
import { createSkirmishConfig } from '../../config/matchConfig';

/** A state where one left-broadside shot sinks the enemy. */
function gameOverSetup(): GameState {
  const base = createGame();
  return {
    ...base,
    obstacles: {},
    ships: {
      ...base.ships,
      'player-ship': {
        ...base.ships['player-ship'],
        position: pos(10, 10),
        heading: 'NORTH',
      },
      'enemy-ship': {
        ...base.ships['enemy-ship'],
        position: pos(7, 10),
        heading: 'SOUTH',
        hp: 1,
        weapons: [],
      },
    },
  };
}

const NO_FIRE = Array.from({ length: 4 }, () => ({ left: false, right: false }));

function plan(
  movement: PlayerActions['movement'] = [null, null, null, null],
  cannons: PlayerActions['cannons'] = NO_FIRE,
): PlayerActions {
  return { movement, cannons };
}

/** Fires the given broadsides in phase 0. */
function firePlan(left: boolean, right: boolean): PlayerActions {
  return plan(undefined, [{ left, right }, ...NO_FIRE.slice(1)]);
}

/** A host for the classic duel with the human's client connected. */
function makeHost(
  options: ConstructorParameters<typeof GameController>[1] = {
    turnDurationMs: null,
  },
): GameController {
  const host = new GameController(new EventBus(), options);
  const first = host.getFirstHumanId();
  if (first) {
    host.registerClient(first);
  }
  return host;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('storing plans', () => {
  it('keeps a draft without locking the player in or spending tokens', () => {
    const host = makeHost();
    const before = host.getState().players.player.tokens;

    const reason = host.submitDraft('player', plan(['FORWARD', 'FORWARD', null, null]));

    expect(reason).toBeNull();
    const player = host.getState().players.player;
    expect(player.queue).toEqual(['FORWARD', 'FORWARD', null, null]);
    expect(player.lockedIn).toBe(false);
    expect(player.tokens).toEqual(before);
    expect(host.getState().status).toBe('planning');
  });

  it('lets a draft be replaced until the player locks in', () => {
    const host = makeHost({ turnDurationMs: null });
    host.submitDraft('player', plan(['FORWARD', null, null, null]));
    host.submitDraft('player', plan([null, 'TURN_LEFT', null, null]));

    expect(host.getState().players.player.queue).toEqual([
      null,
      'TURN_LEFT',
      null,
      null,
    ]);
  });

  it('rejects a plan that needs tokens the player does not hold', () => {
    const host = makeHost();

    const reason = host.submitDraft('player', plan(['TURN_RIGHT', 'TURN_RIGHT', null, null]));

    expect(reason).toBe('not_enough_tokens');
    expect(host.getState().players.player.queue).toEqual([null, null, null, null]);
  });

  it('rejects plans for AI players and unknown players', () => {
    const host = makeHost();

    expect(host.submitDraft('enemy', plan())).toBe('unknown_player');
    expect(host.submitPlayerPlan('nobody', plan())).toBe('unknown_player');
  });

  it('does not accept plans while the turn is resolving', () => {
    const host = makeHost();
    host.submitPlayerPlan('player', plan());

    expect(host.submitDraft('player', plan(['FORWARD', null, null, null]))).toBe(
      'not_planning',
    );
  });
});

describe('turn flow', () => {
  it('resolves a turn, then returns to planning on the next turn', () => {
    const host = makeHost();
    host.submitPlayerPlan('player', plan(['FORWARD', null, null, null]));

    expect(host.getState().status).toBe('animating');
    expect(host.getPendingTurn()).not.toBeNull();

    host.acknowledgeTurn('player');

    const state = host.getState();
    expect(state.status).toBe('planning');
    expect(state.turn).toBe(2);
    expect(host.getPendingTurn()).toBeNull();
    expect(state.players.player.queue.every((slot) => slot === null)).toBe(true);
  });

  it('spends the tokens a plan uses when the turn resolves', () => {
    const host = makeHost();
    const start = host.getState().players.player.tokens.FORWARD;

    host.submitPlayerPlan('player', plan(['FORWARD', 'FORWARD', null, null]));

    expect(host.getState().players.player.tokens.FORWARD).toBe(start - 2);
  });

  it('spends AI tokens at resolution too', () => {
    const host = makeHost();
    const enemy = host.getState().players.enemy.tokens;
    const total = (t: typeof enemy) => t.FORWARD + t.TURN_LEFT + t.TURN_RIGHT;

    host.submitPlayerPlan('player', plan());

    expect(total(host.getState().players.enemy.tokens)).toBeLessThanOrEqual(
      total(enemy),
    );
  });

  it('waits for every connected client to finish animating', () => {
    const config = createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'ffa' });
    const host = new GameController(new EventBus(), { turnDurationMs: null, config });
    host.registerClient('p1');
    host.registerClient('p2');
    host.submitPlayerPlan('p1', plan());
    host.submitPlayerPlan('p2', plan());

    host.acknowledgeTurn('p1');
    expect(host.getState().status).toBe('animating');

    host.acknowledgeTurn('p2');
    expect(host.getState().status).toBe('planning');
  });

  it('does not wait for a human nobody has connected', () => {
    const config = createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'ffa' });
    const host = new GameController(new EventBus(), { turnDurationMs: null, config });
    host.registerClient('p1');
    host.submitPlayerPlan('p1', plan());
    host.submitPlayerPlan('p2', plan());

    host.acknowledgeTurn('p1');

    expect(host.getState().status).toBe('planning');
  });

  it('moves on straight away when no client is connected', () => {
    const host = new GameController(new EventBus(), { turnDurationMs: null });
    host.submitPlayerPlan('player', plan());

    expect(host.getState().status).toBe('planning');
    expect(host.getState().turn).toBe(2);
  });
});

describe('token generation settings', () => {
  it('changes how one player produces their next token', () => {
    const host = makeHost();
    expect(host.getState().players.player.tokenGeneration.auto).toBe(true);

    host.setTokenGeneration('player', { auto: false, requested: 'TURN_RIGHT' });

    const generation = host.getState().players.player.tokenGeneration;
    expect(generation.auto).toBe(false);
    expect(generation.requested).toBe('TURN_RIGHT');
    expect(host.getState().players.enemy.tokenGeneration.auto).toBe(true);
  });
});

describe('passing a turn', () => {
  it('locks in an empty plan as a pass without moving the player ship', () => {
    const host = makeHost();
    host.submitPlayerPlan('player', plan());

    const moved = host
      .getPendingTurn()
      ?.events.some(
        (event) => event.type === 'SHIP_MOVED' && event.shipId === 'player-ship',
      );
    expect(host.getPendingTurn()?.phases).toHaveLength(4);
    expect(moved).toBe(false);
    expect(host.getState().status).toBe('animating');
  });
});

describe('cannons', () => {
  it('spends cannonballs when queued shots resolve', () => {
    const host = makeHost();
    const before = host.getState().players.player.ammo;

    host.submitPlayerPlan('player', firePlan(true, true));

    expect(host.getState().players.player.ammo).toBe(before - 2);
  });

  it('rejects more shots than the cannonball pool', () => {
    const host = makeHost();
    const all = NO_FIRE.map(() => ({ left: true, right: true }));

    expect(host.submitDraft('player', plan(undefined, all))).toBe(
      'not_enough_ammo',
    );
  });
});

describe('game over timing', () => {
  it('keeps animating until the killing turn finishes, then shows game over', () => {
    const host = new GameController(new EventBus(), {
      turnDurationMs: null,
      initialState: gameOverSetup(),
      ai: { chooseActions: () => ({ movement: [], cannons: [] }) },
    });
    host.registerClient('player');

    host.submitPlayerPlan('player', firePlan(true, false));

    expect(host.getState().status).toBe('animating');
    expect(host.getState().outcome).toEqual({ kind: 'win', teamId: 'player' });
    expect(host.getPendingTurn()).not.toBeNull();

    host.acknowledgeTurn('player');

    expect(host.getState().status).toBe('game_over');
    expect(host.getPendingTurn()).toBeNull();
  });
});

describe('planning timer', () => {
  it('auto resolves when the planning window elapses', () => {
    vi.useFakeTimers();
    const host = makeHost({ turnDurationMs: 30000 });

    expect(host.getState().status).toBe('planning');
    expect(host.getPlanningDeadline()).not.toBeNull();

    vi.advanceTimersByTime(30000);

    expect(host.getState().status).not.toBe('planning');
    host.dispose();
  });

  it('uses the plan the host holds when time runs out', () => {
    vi.useFakeTimers();
    const host = makeHost({ turnDurationMs: 30000 });
    host.submitDraft('player', plan(['FORWARD', null, null, null]));

    vi.advanceTimersByTime(30000);

    const moved = host
      .getPendingTurn()
      ?.events.some(
        (event) => event.type === 'SHIP_MOVED' && event.shipId === 'player-ship',
      );
    expect(moved).toBe(true);
    host.dispose();
  });

  it('clears the deadline once the turn resolves', () => {
    const host = makeHost({ turnDurationMs: 30000 });
    expect(host.getPlanningDeadline()).not.toBeNull();

    host.submitPlayerPlan('player', plan());

    expect(host.getPlanningDeadline()).toBeNull();
    host.dispose();
  });

  it('re-arms the timer when the next planning turn begins', () => {
    const host = makeHost({ turnDurationMs: 30000 });
    host.submitPlayerPlan('player', plan());
    host.acknowledgeTurn('player');

    expect(host.getState().status).toBe('planning');
    expect(host.getPlanningDeadline()).not.toBeNull();
    host.dispose();
  });

  it('is disabled when turnDurationMs is null', () => {
    const host = makeHost({ turnDurationMs: null });
    expect(host.getPlanningDeadline()).toBeNull();
  });

  it('reports the seconds remaining', () => {
    vi.useFakeTimers();
    const host = makeHost({ turnDurationMs: 30000 });

    vi.advanceTimersByTime(10000);

    expect(host.getPlanningSecondsRemaining()).toBeCloseTo(20, 0);
    host.dispose();
  });
});

describe('matches with several AI ships', () => {
  const skirmish = () => {
    const host = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa' }),
    });
    host.registerClient('p1');
    return host;
  };

  it('resolves every ship, with the human passing', () => {
    const host = skirmish();
    expect(host.getFirstHumanId()).toBe('p1');

    host.submitPlayerPlan('p1', plan());

    const turn = host.getPendingTurn();
    expect(turn?.phases).toHaveLength(4);
    const moved = new Set(
      turn?.events.flatMap((event) =>
        event.type === 'SHIP_MOVED' ? [event.shipId] : [],
      ),
    );
    expect(moved.has('p1-ship')).toBe(false);
    expect(moved.size).toBeGreaterThan(0);
  });

  it('starts the next turn with every plan cleared', () => {
    const host = skirmish();
    host.submitPlayerPlan('p1', plan());
    host.acknowledgeTurn('p1');

    expect(host.getState().turn).toBe(2);
    expect(host.getState().status).toBe('planning');
    for (const player of Object.values(host.getState().players)) {
      expect(player.queue.every((slot) => slot === null)).toBe(true);
    }
  });
});

describe('locking in with several humans', () => {
  const twoHumans = (
    options: Partial<ConstructorParameters<typeof GameController>[1]> = {},
    rules: Partial<GameState['rules']> = {},
  ) => {
    const config = createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'ffa' });
    const host = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: { ...config, rules: { ...config.rules, ...rules } },
      ...options,
    });
    host.registerClient('p1');
    host.registerClient('p2');
    return host;
  };

  it('waits for the other human after one locks in', () => {
    const host = twoHumans();

    expect(host.lockInPlayer('p1')).toBeNull();

    expect(host.getState().status).toBe('planning');
    expect(host.getState().players.p1.lockedIn).toBe(true);
    expect(host.getState().players.p2.lockedIn).toBe(false);
  });

  it('resolves as soon as the last human locks in', () => {
    const host = twoHumans();
    host.lockInPlayer('p1');

    expect(host.submitPlayerPlan('p2', plan())).toBeNull();

    expect(host.getState().status).toBe('animating');
  });

  it('applies the plan a remote human submitted', () => {
    const host = twoHumans();
    host.lockInPlayer('p1');

    host.submitPlayerPlan('p2', plan(['FORWARD', null, null, null]));

    const moved = host
      .getPendingTurn()
      ?.events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p2-ship');
    expect(moved).toBe(true);
  });

  it('rejects an illegal plan without locking the player in', () => {
    const host = twoHumans();

    const reason = host.submitPlayerPlan(
      'p2',
      plan(['TURN_RIGHT', 'TURN_RIGHT', null, null]),
    );

    expect(reason).toBe('not_enough_tokens');
    expect(host.getState().players.p2.lockedIn).toBe(false);
  });

  it('freezes a plan once the player has locked in', () => {
    const host = twoHumans();
    host.submitDraft('p1', plan(['FORWARD', null, null, null]));
    host.lockInPlayer('p1');

    expect(host.submitDraft('p1', plan(['TURN_LEFT', null, null, null]))).toBe(
      'already_locked_in',
    );
    expect(host.getState().players.p1.queue).toEqual(['FORWARD', null, null, null]);
  });

  it('resolves on the timer with whatever players have queued', () => {
    vi.useFakeTimers();
    const host = twoHumans({ turnDurationMs: 30000 });
    host.lockInPlayer('p1');

    vi.advanceTimersByTime(30000);

    expect(host.getState().status).toBe('animating');
    host.dispose();
  });

  it('waits for the timer when the rules say not to end early', () => {
    vi.useFakeTimers();
    const host = twoHumans({ turnDurationMs: 30000 }, { endTurnWhenAllLocked: false });
    host.lockInPlayer('p1');
    host.submitPlayerPlan('p2', plan());

    expect(host.getState().status).toBe('planning');

    vi.advanceTimersByTime(30000);

    expect(host.getState().status).toBe('animating');
    host.dispose();
  });

  it('unlocks everyone when the next turn begins', () => {
    const host = twoHumans();
    host.lockInPlayer('p1');
    host.submitPlayerPlan('p2', plan());
    host.acknowledgeTurn('p1');
    host.acknowledgeTurn('p2');

    for (const player of Object.values(host.getState().players)) {
      expect(player.lockedIn).toBe(false);
    }
  });
});

describe('a controller per AI player', () => {
  it('uses the AI assigned to each player', () => {
    const asked: string[] = [];
    const recorder = (label: string) => ({
      chooseActions: (_state: GameState, playerId: string) => {
        asked.push(`${label}:${playerId}`);
        return { movement: [], cannons: [] };
      },
    });
    const host = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 1, ais: 2, teamMode: 'ffa' }),
      ai: recorder('default'),
      aiByPlayer: { p3: recorder('special') },
    });

    host.submitPlayerPlan('p1', plan());

    expect(asked.sort()).toEqual(['default:p2', 'special:p3']);
  });
});
