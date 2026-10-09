import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { createSkirmishConfig } from '@pirate/game-core/config/matchConfig';
import { redactState } from '@pirate/game-core/view/redact';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { PlayerActions } from '@pirate/game-core/domain/TurnResult';
import type { GameView } from '@pirate/game-core/view/GameView';
import { SocketTransport, type GameSocket } from '../SocketTransport';

/** Just enough of a socket: records what is sent, lets a test "receive". */
class FakeSocket extends EventEmitter {
  connected = true;
  sent: Array<{ event: string; payload: unknown }> = [];

  override emit(event: string, ...args: unknown[]): boolean {
    this.sent.push({ event, payload: args[0] });
    return true;
  }

  receive(event: string, payload?: unknown): void {
    super.emit(event, payload);
  }

  sentOf(event: string): unknown[] {
    return this.sent.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

const baseState = createGame(createSkirmishConfig({ humans: 2, ais: 0, teamMode: 'ffa' }));

function viewWith(patch: {
  status?: GameView['status'];
  turn?: number;
  lockedIn?: boolean;
}): GameView {
  const state = {
    ...baseState,
    status: patch.status ?? 'planning',
    turn: patch.turn ?? 1,
    players: {
      ...baseState.players,
      p1: { ...baseState.players.p1, lockedIn: patch.lockedIn ?? false },
    },
  };
  return redactState(state, 'p1', 30);
}

const noFire = Array.from({ length: 4 }, () => ({ left: false, right: false }));
const plan = (first: PlayerActions['movement'][number]): PlayerActions => ({
  movement: [first, null, null, null],
  cannons: noFire,
});

function turnEvents(turn: number): GameEvent[] {
  return [
    { type: 'TURN_STARTED', turn },
    { type: 'PHASE_STARTED', phase: 0 },
    { type: 'PHASE_ENDED', phase: 0 },
    { type: 'TURN_ENDED', turn },
  ];
}

let socket: FakeSocket;
let transport: SocketTransport;

function make(options = {}) {
  socket = new FakeSocket();
  transport = new SocketTransport(socket as unknown as GameSocket, 'p1', viewWith({}), {
    draftDelayMs: 100,
    ...options,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  make();
});

afterEach(() => {
  transport.dispose();
  vi.useRealTimers();
});

describe('views', () => {
  it('starts with the view it was given and tells subscribers straight away', () => {
    const seen: GameView[] = [];

    transport.subscribe((view) => seen.push(view));

    expect(transport.viewerId).toBe('p1');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(transport.getView());
  });

  it('passes on every view the server sends', () => {
    const seen: number[] = [];
    transport.subscribe((view) => seen.push(view.turn));

    socket.receive('game:view', viewWith({ turn: 2 }));

    expect(seen).toEqual([1, 2]);
    expect(transport.getView().turn).toBe(2);
  });

  it('stops listening once disposed', () => {
    transport.dispose();

    expect(socket.listenerCount('game:view')).toBe(0);
    expect(socket.listenerCount('game:turn')).toBe(0);
  });
});

describe('sharing the draft', () => {
  it('waits for a pause in editing and sends only the latest draft', () => {
    transport.syncDraft(plan('FORWARD'));
    vi.advanceTimersByTime(50);
    transport.syncDraft(plan('TURN_LEFT'));
    vi.advanceTimersByTime(99);
    expect(socket.sentOf('game:draft')).toHaveLength(0);

    vi.advanceTimersByTime(1);

    expect(socket.sentOf('game:draft')).toEqual([plan('TURN_LEFT')]);
  });

  it('does not send a draft after locking in', () => {
    transport.syncDraft(plan('FORWARD'));

    transport.lockIn(plan('FORWARD'));
    vi.advanceTimersByTime(500);

    expect(socket.sentOf('game:draft')).toHaveLength(0);
    expect(socket.sentOf('game:lockIn')).toEqual([plan('FORWARD')]);
  });
});

describe('losing the connection', () => {
  it('holds a lock-in it could not send and sends it after the seat is restored', () => {
    socket.connected = false;

    transport.lockIn(plan('FORWARD'));
    expect(socket.sentOf('game:lockIn')).toHaveLength(0);

    socket.connected = true;
    transport.flush();

    expect(socket.sentOf('game:lockIn')).toEqual([plan('FORWARD')]);
  });

  it('holds a draft it could not send too', () => {
    socket.connected = false;
    transport.syncDraft(plan('FORWARD'));
    vi.advanceTimersByTime(200);
    expect(socket.sentOf('game:draft')).toHaveLength(0);

    socket.connected = true;
    transport.flush();

    expect(socket.sentOf('game:draft')).toEqual([plan('FORWARD')]);
  });

  it('prefers the lock-in over an older draft', () => {
    socket.connected = false;
    transport.syncDraft(plan('TURN_LEFT'));
    transport.lockIn(plan('FORWARD'));

    socket.connected = true;
    transport.flush();

    expect(socket.sentOf('game:lockIn')).toEqual([plan('FORWARD')]);
    expect(socket.sentOf('game:draft')).toHaveLength(0);
  });

  it('sends nothing more once the server shows the plan as locked in', () => {
    socket.connected = false;
    transport.lockIn(plan('FORWARD'));
    socket.connected = true;
    socket.receive('game:view', viewWith({ lockedIn: true }));

    transport.flush();

    expect(socket.sentOf('game:lockIn')).toHaveLength(0);
  });

  it('does not send tokens or acknowledgements into a dead connection', () => {
    socket.connected = false;

    transport.setTokenGeneration({ auto: false });
    transport.acknowledgeTurn();

    expect(socket.sent).toHaveLength(0);
  });
});

describe('turn events', () => {
  it('hands the events of a turn to subscribers in order', () => {
    const types: string[] = [];
    transport.onEvents((event) => types.push(event.type));

    socket.receive('game:turn', { events: turnEvents(1) });

    expect(types).toEqual(['TURN_STARTED', 'PHASE_STARTED', 'PHASE_ENDED', 'TURN_ENDED']);
  });

  it('keeps the turn for a client that subscribes late, until the animation is over', () => {
    socket.receive('game:view', viewWith({ status: 'animating' }));
    socket.receive('game:turn', { events: turnEvents(1) });

    expect(transport.getPendingEvents()).toHaveLength(4);

    socket.receive('game:view', viewWith({ status: 'planning', turn: 2 }));

    expect(transport.getPendingEvents()).toBeNull();
  });

  it('does not play a turn twice when the server replays it after a reconnect', () => {
    const seen: GameEvent[] = [];
    transport.onEvents((event) => seen.push(event));

    socket.receive('game:turn', { events: turnEvents(1) });
    socket.receive('game:turn', { events: turnEvents(1) });

    expect(seen).toHaveLength(4);
  });

  it('still plays the next turn', () => {
    const seen: GameEvent[] = [];
    transport.onEvents((event) => seen.push(event));

    socket.receive('game:turn', { events: turnEvents(1) });
    socket.receive('game:turn', { events: turnEvents(2) });

    expect(seen).toHaveLength(8);
  });

  it('stops delivering to a subscriber that has unsubscribed', () => {
    const seen: GameEvent[] = [];
    const stop = transport.onEvents((event) => seen.push(event));

    stop();
    socket.receive('game:turn', { events: turnEvents(1) });

    expect(seen).toHaveLength(0);
  });
});

describe('other commands', () => {
  it('sends token settings and acknowledgements', () => {
    transport.setTokenGeneration({ auto: false, requested: 'TURN_LEFT' });
    transport.acknowledgeTurn();

    expect(socket.sentOf('game:tokens')).toEqual([{ auto: false, requested: 'TURN_LEFT' }]);
    expect(socket.sentOf('game:ack')).toHaveLength(1);
  });

  it('leaves the match when asked to start over', () => {
    const onLeave = vi.fn();
    transport.dispose();
    make({ onLeave });

    transport.restart();

    expect(onLeave).toHaveBeenCalledOnce();
  });
});
