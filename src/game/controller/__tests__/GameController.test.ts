import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../events/EventBus';
import { GameController } from '../GameController';
import { createGame } from '../../simulation/createGame';
import type { GameState } from '../../domain/GameState';
import { pos } from '../../domain/Position';

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
    const start = controller.getState().tokenInventories.player.FORWARD;

    controller.queuePlayerAction('FORWARD');
    expect(controller.getState().queues.player[0]).toBe('FORWARD');
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(
      start - 1,
    );

    controller.removePlayerAction(0);
    expect(controller.getState().queues.player[0]).toBeNull();
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(start);
  });

  it('cannot queue a token that is not in the pool', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('FORWARD');

    expect(controller.getState().tokenInventories.player.FORWARD).toBe(0);
    controller.queuePlayerAction('FORWARD');

    expect(controller.getState().tokenInventories.player.FORWARD).toBe(0);
    expect(
      controller.getState().queues.player.filter((slot) => slot !== null),
    ).toHaveLength(3);
  });

  it('returns all queued tokens on clear', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.queuePlayerAction('TURN_LEFT');

    controller.clearPlayerActions();

    expect(controller.getState().queues.player.every((slot) => slot === null)).toBe(
      true,
    );
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(3);
    expect(controller.getState().tokenInventories.player.TURN_LEFT).toBe(2);
  });

  it('can place a move into a specific slot, leaving earlier slots empty', () => {
    const controller = makeController();

    controller.queuePlayerAction('FORWARD', 2);

    expect(controller.getState().queues.player).toEqual([
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

    expect(controller.getState().queues.player).toEqual([
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
      controller.getState().queues.player.every((slot) => slot === null),
    ).toBe(true);
  });

  it('does not accept input while resolving or animating', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.lockInTurn();

    const snapshot = controller.getState().tokenInventories.player.FORWARD;
    controller.queuePlayerAction('FORWARD');
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(snapshot);
  });
});

describe('token generation settings', () => {
  it('exposes auto and requested token settings', () => {
    const controller = makeController();
    expect(controller.getState().tokenGeneration.auto).toBe(true);

    controller.setAutoTokenGeneration(false);
    controller.setRequestedTokenType('TURN_RIGHT');

    expect(controller.getState().tokenGeneration.auto).toBe(false);
    expect(controller.getState().tokenGeneration.requested).toBe('TURN_RIGHT');
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
    const before = controller.getState().tokenInventories.player.FORWARD;

    controller.togglePlayerCannon(0, 'left');
    expect(controller.getState().cannonQueues.player[0].left).toBe(true);
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(before);

    controller.togglePlayerCannon(0, 'left');
    expect(controller.getState().cannonQueues.player[0].left).toBe(false);
  });

  it('cannot queue more shots than the cannonball pool', () => {
    const controller = makeController();

    controller.togglePlayerCannon(0, 'left');
    controller.togglePlayerCannon(0, 'right');
    controller.togglePlayerCannon(1, 'left');
    controller.togglePlayerCannon(1, 'right');

    const queued = controller
      .getState()
      .cannonQueues.player.reduce(
        (total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0),
        0,
      );
    expect(queued).toBe(3);
    expect(controller.getState().cannonQueues.player[1].right).toBe(false);
  });

  it('clears queued shots and returns movement tokens', () => {
    const controller = makeController();
    controller.queuePlayerAction('FORWARD');
    controller.togglePlayerCannon(0, 'left');

    controller.clearPlayerActions();

    expect(
      controller
        .getState()
        .cannonQueues.player.every((slot) => !slot.left && !slot.right),
    ).toBe(true);
    expect(controller.getState().tokenInventories.player.FORWARD).toBe(3);
  });

  it('spends cannonballs when queued shots resolve', () => {
    const controller = makeController();
    controller.togglePlayerCannon(0, 'left');
    controller.togglePlayerCannon(0, 'right');
    const before = controller.getState().ammo.player;

    controller.lockInTurn();

    expect(controller.getState().ammo.player).toBe(before - 2);
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
    expect(controller.getState().winner).toBe('player');
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
