import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../events/EventBus';
import { GameController } from '../GameController';
import { createGame } from '../../simulation/createGame';
import type { GameState } from '../../domain/GameState';
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

function makeController(
  options: ConstructorParameters<typeof GameController>[1] = {
    turnDurationMs: null,
  },
): GameController {
  return new GameController(new EventBus(), options);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('move token pool', () => {
  it('spends a token when queued and returns it when removed', () => {
    const controller = makeController();
    const start = controller.getState().players.player.tokens.FORWARD;

    controller.queuePlayerAction('FORWARD');
    expect(controller.getState().players.player.queue[0]).toBe('FORWARD');
    expect(controller.getState().players.player.tokens.FORWARD).toBe(
      start - 1,
    );

    controller.removePlayerAction(0);
    expect(controller.getState().players.player.queue[0]).toBeNull();
    expect(controller.getState().players.player.tokens.FORWARD).toBe(start);
  });

  it('cannot queue a token that is not in the pool', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('FORWARD');

    expect(controller.getState().players.player.tokens.FORWARD).toBe(0);
    controller.queuePlayerAction('FORWARD');

    expect(controller.getState().players.player.tokens.FORWARD).toBe(0);
    expect(
      controller.getState().players.player.queue.filter((slot) => slot !== null),
    ).toHaveLength(3);
  });

  it('returns all queued tokens on clear', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('TURN_LEFT');

    controller.clearPlayerActions();

    expect(controller.getState().players.player.queue.every((slot) => slot === null)).toBe(
      true,
    );
    expect(controller.getState().players.player.tokens.FORWARD).toBe(3);
    expect(controller.getState().players.player.tokens.TURN_LEFT).toBe(2);
  });

  it('can place a move into a specific slot, leaving earlier slots empty', () => {
    const controller = makeController();

    controller.queuePlayerAction('FORWARD', 2);

    expect(controller.getState().players.player.queue).toEqual([
      null,
      null,
      'FORWARD',
      null,
    ]);
  });

  it('falls back to the first empty slot when the target is filled', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD', 0);
    controller.queuePlayerAction('TURN_LEFT', 0);

    expect(controller.getState().players.player.queue).toEqual([
      'FORWARD',
      'TURN_LEFT',
      null,
      null,
    ]);
  });
});

describe('turn flow', () => {
  it('resolves a turn, then returns to planning on the next turn', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');

    const result = controller.lockInTurn();
    expect(result).not.toBeNull();
    expect(controller.getState().status).toBe('animating');
    expect(controller.getPendingTurn()).toBe(result);

    controller.onAnimationComplete();
    expect(controller.getState().status).toBe('planning');
    expect(controller.getState().turn).toBe(2);
    expect(controller.getPendingTurn()).toBeNull();
    expect(
      controller.getState().players.player.queue.every((slot) => slot === null),
    ).toBe(true);
  });

  it('does not accept input while resolving or animating', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.lockInTurn();

    const snapshot = controller.getState().players.player.tokens.FORWARD;
    controller.queuePlayerAction('FORWARD');
    expect(controller.getState().players.player.tokens.FORWARD).toBe(snapshot);
  });
});

describe('token generation settings', () => {
  it('exposes auto and requested token settings', () => {
    const controller = makeController();
    expect(controller.getState().players.player.tokenGeneration.auto).toBe(true);

    controller.setAutoTokenGeneration(false);
    controller.setRequestedTokenType('TURN_RIGHT');

    expect(controller.getState().players.player.tokenGeneration.auto).toBe(false);
    expect(controller.getState().players.player.tokenGeneration.requested).toBe('TURN_RIGHT');
  });
});

describe('passing a turn', () => {
  it('locks in an empty queue as a pass without moving the player ship', () => {
    const controller = makeController();
    const result = controller.lockInTurn();

    expect(result).not.toBeNull();
    expect(result?.phases).toHaveLength(4);

    const playerMoved = result?.events.some(
      (event) => event.type === 'SHIP_MOVED' && event.shipId === 'player-ship',
    );
    expect(playerMoved).toBe(false);
    expect(controller.getState().status).toBe('animating');
  });
});

describe('cannon queueing', () => {
  it('toggles a broadside on and off without spending a movement token', () => {
    const controller = makeController();
    const before = controller.getState().players.player.tokens.FORWARD;

    controller.togglePlayerCannon(0, 'left');
    expect(controller.getState().players.player.cannonQueue[0].left).toBe(true);
    expect(controller.getState().players.player.tokens.FORWARD).toBe(before);

    controller.togglePlayerCannon(0, 'left');
    expect(controller.getState().players.player.cannonQueue[0].left).toBe(false);
  });

  it('cannot queue more shots than the cannonball pool', () => {
    const controller = makeController();

    controller.togglePlayerCannon(0, 'left');
    controller.togglePlayerCannon(0, 'right');
    controller.togglePlayerCannon(1, 'left');
    controller.togglePlayerCannon(1, 'right');

    const queued = controller
      .getState()
      .players.player.cannonQueue.reduce(
        (total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0),
        0,
      );
    expect(queued).toBe(3);
    expect(controller.getState().players.player.cannonQueue[1].right).toBe(false);
  });

  it('clears queued shots and returns movement tokens', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.togglePlayerCannon(0, 'left');

    controller.clearPlayerActions();

    expect(
      controller
        .getState()
        .players.player.cannonQueue.every((slot) => !slot.left && !slot.right),
    ).toBe(true);
    expect(controller.getState().players.player.tokens.FORWARD).toBe(3);
  });

  it('spends cannonballs when queued shots resolve', () => {
    const controller = makeController();
    controller.togglePlayerCannon(0, 'left');
    controller.togglePlayerCannon(0, 'right');
    const before = controller.getState().players.player.ammo;

    controller.lockInTurn();

    expect(controller.getState().players.player.ammo).toBe(before - 2);
  });
});

describe('game over timing', () => {
  it('keeps animating until the killing turn finishes, then shows game over', () => {
    const controller = new GameController(new EventBus(), {
      turnDurationMs: null,
      initialState: gameOverSetup(),
      ai: { chooseActions: () => ({ movement: [], cannons: [] }) },
    });

    controller.togglePlayerCannon(0, 'left');
    controller.lockInTurn();

    expect(controller.getState().status).toBe('animating');
    expect(controller.getState().outcome).toEqual({
      kind: 'win',
      teamId: 'player',
    });
    expect(controller.getPendingTurn()).not.toBeNull();

    controller.onAnimationComplete();

    expect(controller.getState().status).toBe('game_over');
    expect(controller.getPendingTurn()).toBeNull();
  });
});

describe('planning timer', () => {
  it('auto locks in when the planning window elapses', () => {
    vi.useFakeTimers();
    const controller = makeController({ turnDurationMs: 30000 });

    expect(controller.getState().status).toBe('planning');
    expect(controller.getPlanningDeadline()).not.toBeNull();

    vi.advanceTimersByTime(30000);

    expect(controller.getState().status).not.toBe('planning');
    controller.dispose();
  });

  it('clears the deadline once locked in', () => {
    const controller = makeController({ turnDurationMs: 30000 });
    expect(controller.getPlanningDeadline()).not.toBeNull();

    controller.lockInTurn();

    expect(controller.getPlanningDeadline()).toBeNull();
    controller.dispose();
  });

  it('re-arms the timer when the next planning turn begins', () => {
    const controller = makeController({ turnDurationMs: 30000 });
    controller.lockInTurn();
    controller.onAnimationComplete();

    expect(controller.getState().status).toBe('planning');
    expect(controller.getPlanningDeadline()).not.toBeNull();
    controller.dispose();
  });

  it('is disabled when turnDurationMs is null', () => {
    const controller = makeController({ turnDurationMs: null });
    expect(controller.getPlanningDeadline()).toBeNull();
  });
});

describe('matches with several AI ships', () => {
  const skirmish = () =>
    new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 1, ais: 3, teamMode: 'ffa' }),
    });

  it('plans for the first human and resolves every ship', () => {
    const controller = skirmish();
    expect(controller.getViewerId()).toBe('p1');

    const before = controller.getState().players;
    const result = controller.lockInTurn();

    expect(result?.phases).toHaveLength(4);
    const moved = new Set(
      result?.events.flatMap((event) =>
        event.type === 'SHIP_MOVED' ? [event.shipId] : [],
      ),
    );
    // The human passed, so only AI ships can move.
    expect(moved.has('p1-ship')).toBe(false);
    expect(moved.size).toBeGreaterThan(0);

    for (const id of ['p2', 'p3', 'p4']) {
      const total = (tokens: { FORWARD: number; TURN_LEFT: number; TURN_RIGHT: number }) =>
        tokens.FORWARD + tokens.TURN_LEFT + tokens.TURN_RIGHT;
      expect(total(controller.getState().players[id].tokens)).toBeLessThanOrEqual(
        total(before[id].tokens),
      );
    }
  });

  it('starts the next turn with a token for every player', () => {
    const controller = skirmish();
    controller.lockInTurn();
    controller.onAnimationComplete();

    expect(controller.getState().turn).toBe(2);
    expect(controller.getState().status).toBe('planning');
    for (const player of Object.values(controller.getState().players)) {
      expect(player.queue.every((slot) => slot === null)).toBe(true);
    }
  });

  it('controls only the local human (others pass)', () => {
    const controller = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'teams' }),
    });

    controller.queuePlayerAction('FORWARD');
    expect(controller.getState().players.p1.queue[0]).toBe('FORWARD');
    expect(controller.getState().players.p2.queue[0]).toBeNull();
  });

  it('refuses a match with no human to control', () => {
    expect(
      () =>
        new GameController(new EventBus(), {
          turnDurationMs: null,
          config: createSkirmishConfig({ humans: 0, ais: 2, teamMode: 'ffa' }),
        }),
    ).toThrow();
  });
});

describe('locking in with several humans', () => {
  const twoHumans = (
    options: Partial<ConstructorParameters<typeof GameController>[1]> = {},
    rules: Partial<GameState['rules']> = {},
  ) => {
    const config = createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'ffa' });
    return new GameController(new EventBus(), {
      turnDurationMs: null,
      config: { ...config, rules: { ...config.rules, ...rules } },
      ...options,
    });
  };

  const emptyPlan = {
    movement: [null, null, null, null],
    cannons: Array.from({ length: 4 }, () => ({ left: false, right: false })),
  };

  it('waits for the other human after you lock in', () => {
    const controller = twoHumans();

    const result = controller.lockInTurn();

    expect(result).toBeNull();
    expect(controller.getState().status).toBe('planning');
    expect(controller.getState().players.p1.lockedIn).toBe(true);
    expect(controller.getState().players.p2.lockedIn).toBe(false);
  });

  it('resolves as soon as the last human locks in', () => {
    const controller = twoHumans();
    controller.lockInTurn();

    expect(controller.submitPlayerPlan('p2', emptyPlan)).toBeNull();

    expect(controller.getState().status).toBe('animating');
    expect(controller.getPendingTurn()).not.toBeNull();
  });

  it('applies the plan a remote human submitted', () => {
    const controller = twoHumans();
    controller.lockInTurn();

    controller.submitPlayerPlan('p2', {
      ...emptyPlan,
      movement: ['FORWARD', null, null, null],
    });

    const moved = controller
      .getPendingTurn()
      ?.events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p2-ship');
    expect(moved).toBe(true);
  });

  it('rejects an illegal plan without locking the player in', () => {
    const controller = twoHumans();

    const reason = controller.submitPlayerPlan('p2', {
      ...emptyPlan,
      movement: ['TURN_RIGHT', 'TURN_RIGHT', null, null],
    });

    expect(reason).toBe('not_enough_tokens');
    expect(controller.getState().players.p2.lockedIn).toBe(false);
  });

  it('does not accept plans for AI players or unknown players', () => {
    const controller = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 1, ais: 1, teamMode: 'ffa' }),
    });

    expect(controller.submitPlayerPlan('p2', emptyPlan)).toBe('unknown_player');
    expect(controller.submitPlayerPlan('nobody', emptyPlan)).toBe('unknown_player');
  });

  it('freezes your plan once you have locked in', () => {
    const controller = twoHumans();
    controller.queuePlayerAction('FORWARD');
    controller.lockInTurn();

    controller.queuePlayerAction('FORWARD');
    controller.togglePlayerCannon(0, 'left');
    controller.removePlayerAction(0);
    controller.clearPlayerActions();

    const player = controller.getState().players.p1;
    expect(player.queue).toEqual(['FORWARD', null, null, null]);
    expect(player.cannonQueue[0].left).toBe(false);
  });

  it('resolves on the timer with whatever players have queued', () => {
    vi.useFakeTimers();
    const controller = twoHumans({ turnDurationMs: 30000 });
    controller.lockInTurn();

    vi.advanceTimersByTime(30000);

    expect(controller.getState().status).toBe('animating');
    controller.dispose();
  });

  it('waits for the timer when the rules say not to end early', () => {
    vi.useFakeTimers();
    const controller = twoHumans({ turnDurationMs: 30000 }, { endTurnWhenAllLocked: false });
    controller.lockInTurn();
    controller.submitPlayerPlan('p2', emptyPlan);

    expect(controller.getState().status).toBe('planning');

    vi.advanceTimersByTime(30000);

    expect(controller.getState().status).toBe('animating');
    controller.dispose();
  });

  it('unlocks everyone when the next turn begins', () => {
    const controller = twoHumans();
    controller.lockInTurn();
    controller.submitPlayerPlan('p2', emptyPlan);
    controller.onAnimationComplete();

    for (const player of Object.values(controller.getState().players)) {
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
    const controller = new GameController(new EventBus(), {
      turnDurationMs: null,
      config: createSkirmishConfig({ humans: 1, ais: 2, teamMode: 'ffa' }),
      ai: recorder('default'),
      aiByPlayer: { p3: recorder('special') },
    });

    controller.lockInTurn();

    expect(asked.sort()).toEqual(['default:p2', 'special:p3']);
  });
});
