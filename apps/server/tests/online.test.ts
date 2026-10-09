/**
 * End to end: the client's real online code (OnlineSession, SocketTransport,
 * GameClient) against the real server, over real sockets.
 */
import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import {
  OnlineSession,
  type KeyValueStore,
  type SessionState,
} from '../../client/src/online/OnlineSession';
import type { GameSocket } from '../../client/src/online/SocketTransport';
import type { GameServer } from '../src/gameServer';
import { startServer } from './helpers';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let server: GameServer;
const sessions: OnlineSession[] = [];
/** Raw sockets by session, so a test can cut the connection. */
const sockets = new Map<OnlineSession, GameSocket>();

function newSession(
  storage: KeyValueStore = new MemoryStore(),
  overrides: { port?: number; timeoutMs?: number } = {},
): OnlineSession {
  const url = `http://127.0.0.1:${overrides.port ?? server.port}`;
  let session: OnlineSession;
  session = new OnlineSession({
    serverUrl: url,
    storage,
    timeoutMs: overrides.timeoutMs ?? 3000,
    connect: (target) => {
      const socket: GameSocket = io(target, {
        transports: ['websocket'],
        forceNew: true,
        reconnectionDelay: 50,
        reconnectionDelayMax: 100,
      });
      sockets.set(session, socket);
      return socket;
    },
  });
  sessions.push(session);
  return session;
}

/**
 * Waits until the condition holds for the session (it is re-checked on every
 * session change and every 20 ms, so it may also look at things like the
 * events a client has received).
 */
function until(
  session: OnlineSession,
  condition: (state: SessionState) => boolean,
  timeoutMs = 4000,
): Promise<SessionState> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      stop();
      clearInterval(poll);
      clearTimeout(timer);
    };
    const check = () => {
      if (condition(session.getState())) {
        finish();
        resolve(session.getState());
      }
    };
    const stop = session.subscribe(check);
    const poll = setInterval(check, 20);
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Timed out waiting for the session state'));
    }, timeoutMs);
    check();
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    session.leave();
  }
  sockets.clear();
  await server.close();
});

/** Two sessions in a started match with no timer. */
async function startedMatch() {
  const anne = newSession();
  const bart = newSession();
  expect(await anne.createRoom('Anne', { ais: 0, turnDurationSeconds: null })).toBe(true);
  const code = anne.getState().lobby!.roomId;
  expect(await bart.joinRoom(code, 'Bart')).toBe(true);
  await anne.start();
  await until(anne, (s) => s.phase === 'playing');
  await until(bart, (s) => s.phase === 'playing');
  return { anne, bart, code };
}

describe('the lobby', () => {
  it('creates a room and shows it', async () => {
    const anne = newSession();

    const ok = await anne.createRoom('Anne');

    expect(ok).toBe(true);
    const state = anne.getState();
    expect(state.phase).toBe('lobby');
    expect(state.connection).toBe('connected');
    expect(state.lobby?.seats).toHaveLength(1);
    expect(state.seatId).toBe(state.lobby?.seats[0].seatId);
  });

  it('lets a friend join with the code and updates both sides', async () => {
    const anne = newSession();
    const bart = newSession();
    await anne.createRoom('Anne');
    const code = anne.getState().lobby!.roomId;

    expect(await bart.joinRoom(code, 'Bart')).toBe(true);

    const seen = await until(anne, (s) => s.lobby?.seats.length === 2);
    expect(seen.lobby?.seats.map((seat) => seat.name)).toEqual(['Anne', 'Bart']);
    expect(bart.getState().lobby?.seats).toHaveLength(2);
  });

  it('lets the host change the options for everyone', async () => {
    const anne = newSession();
    const bart = newSession();
    await anne.createRoom('Anne');
    await bart.joinRoom(anne.getState().lobby!.roomId, 'Bart');

    await anne.configure({ ais: 3, teamMode: 'teams' });

    await until(bart, (s) => s.lobby?.options.ais === 3);
    expect(bart.getState().lobby?.options.teamMode).toBe('teams');
  });

  it('explains a failure and stays on the menu', async () => {
    const bart = newSession();

    const ok = await bart.joinRoom('ZZZZZ', 'Bart');

    expect(ok).toBe(false);
    expect(bart.getState().phase).toBe('menu');
    expect(bart.getState().message).toMatch(/no room/i);
  });

  it('explains when the server cannot be reached', async () => {
    const lost = newSession(new MemoryStore(), { port: 1, timeoutMs: 400 });

    const ok = await lost.createRoom('Anne');

    expect(ok).toBe(false);
    expect(lost.getState().message).toMatch(/could not reach/i);
    expect(lost.getState().phase).toBe('menu');
  });

  it('will not start a match with only one ship', async () => {
    const anne = newSession();
    await anne.createRoom('Anne', { ais: 0 });

    await anne.start();

    expect(anne.getState().phase).toBe('lobby');
    expect(anne.getState().message).toMatch(/at least two ships/i);
  });

  it('removes a player who leaves the lobby and forgets their seat', async () => {
    const store = new MemoryStore();
    const anne = newSession();
    const bart = newSession(store);
    await anne.createRoom('Anne');
    await bart.joinRoom(anne.getState().lobby!.roomId, 'Bart');
    expect(store.data.size).toBe(1);

    bart.leave();

    await until(anne, (s) => s.lobby?.seats.length === 1);
    expect(bart.getState().phase).toBe('menu');
    expect(store.data.size).toBe(0);
  });
});

describe('playing', () => {
  it('turns the lobby into a match for everyone', async () => {
    const { anne, bart } = await startedMatch();

    const annesView = anne.getState().client!.getView();
    const bartsView = bart.getState().client!.getView();

    expect(annesView.viewerId).toBe('p1');
    expect(bartsView.viewerId).toBe('p2');
    expect(annesView.players.p2.name).toBe('Bart');
    expect(annesView.status).toBe('planning');
  });

  it('plays a whole turn through the real client code', async () => {
    const { anne, bart } = await startedMatch();
    const annesClient = anne.getState().client!;
    const bartsClient = bart.getState().client!;
    const events: GameEvent[] = [];
    annesClient.onEvents((event) => events.push(event));

    annesClient.queueToken('FORWARD');
    expect(annesClient.getSnapshot().draft.movement[0]).toBe('FORWARD');
    annesClient.lockIn();
    bartsClient.lockIn();

    await until(anne, () => events.some((event) => event.type === 'TURN_ENDED'));
    expect(events[0].type).toBe('TURN_STARTED');
    expect(
      events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p1-ship'),
    ).toBe(true);
    expect(annesClient.getView().status).toBe('animating');

    annesClient.acknowledgeTurn();
    bartsClient.acknowledgeTurn();
    await pause(150);

    expect(annesClient.getView().turn).toBe(2);
    expect(annesClient.getView().status).toBe('planning');
    expect(annesClient.getSnapshot().canEdit).toBe(true);
    expect(annesClient.getSnapshot().draft.movement.every((slot) => slot === null)).toBe(true);
  });

  it('shows one player only the activity of the other, never the plan', async () => {
    const { anne, bart } = await startedMatch();

    anne.getState().client!.queueToken('FORWARD');
    anne.getState().client!.queueToken('TURN_LEFT');
    await pause(400);

    const bartsView = bart.getState().client!.getView();
    expect(bartsView.players.p1.activity).toBeGreaterThan(0);
    expect(JSON.stringify(bartsView)).not.toContain('"FORWARD","TURN_LEFT"');
  });

  it('tells the player when the server refuses a plan', async () => {
    const { anne } = await startedMatch();
    const client = anne.getState().client!;

    // Lie to the server about what we hold: queue a token we do not have.
    client.queueToken('TURN_RIGHT');
    (client as unknown as { transport: { lockIn(plan: object): void } }).transport.lockIn({
      movement: ['TURN_RIGHT', 'TURN_RIGHT', null, null],
      cannons: Array.from({ length: 4 }, () => ({ left: false, right: false })),
    });

    const state = await until(anne, (s) => s.notice !== null);
    expect(state.notice).toBe('not_enough_tokens');
  });

  it('goes back to the menu when the player leaves after the match', async () => {
    const { anne } = await startedMatch();
    const client = anne.getState().client!;

    client.restart();

    expect(anne.getState().phase).toBe('menu');
    expect(anne.getState().client).toBeNull();
  });
});

describe('losing the connection', () => {
  it('reconnects on its own and keeps the match', async () => {
    const { anne } = await startedMatch();
    const client = anne.getState().client!;
    client.queueToken('FORWARD');
    await pause(300);

    sockets.get(anne)!.io.engine.close(); // the network drops
    await until(anne, (s) => s.connection === 'reconnecting');
    await until(anne, (s) => s.connection === 'connected');
    await pause(150);

    expect(anne.getState().phase).toBe('playing');
    expect(anne.getState().client).toBe(client);
    expect(client.getSnapshot().draft.movement[0]).toBe('FORWARD');
    expect(client.getView().status).toBe('planning');
  });

  it('sends a plan locked in while offline once it is back', async () => {
    const { anne, bart } = await startedMatch();
    const annesClient = anne.getState().client!;
    const bartsClient = bart.getState().client!;
    const events: GameEvent[] = [];
    annesClient.onEvents((event) => events.push(event));

    sockets.get(anne)!.io.engine.close();
    await until(anne, (s) => s.connection === 'reconnecting');
    annesClient.queueToken('FORWARD');
    annesClient.lockIn(); // cannot be delivered yet
    bartsClient.lockIn();
    await until(anne, (s) => s.connection === 'connected');

    await until(anne, () => events.some((event) => event.type === 'TURN_ENDED'));
    expect(
      events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p1-ship'),
    ).toBe(true);
  });

  it('does not play the same turn twice when it is replayed after a reconnect', async () => {
    const { anne, bart } = await startedMatch();
    const annesClient = anne.getState().client!;
    const events: GameEvent[] = [];
    annesClient.onEvents((event) => events.push(event));
    annesClient.lockIn();
    bart.getState().client!.lockIn();
    await until(anne, () => events.some((event) => event.type === 'TURN_ENDED'));
    const count = events.length;

    sockets.get(anne)!.io.engine.close();
    await until(anne, (s) => s.connection === 'reconnecting');
    await until(anne, (s) => s.connection === 'connected');
    await pause(200);

    expect(events).toHaveLength(count);
  });
});

describe('coming back after a refresh', () => {
  it('rejoins the match with the remembered seat', async () => {
    const store = new MemoryStore();
    const anne = newSession(store);
    await anne.createRoom('Anne', { ais: 1, turnDurationSeconds: null });
    await anne.start();
    await until(anne, (s) => s.phase === 'playing');
    anne.getState().client!.queueToken('FORWARD');
    await pause(400);

    // "Refresh": a brand new session over the same storage.
    sockets.get(anne)!.disconnect();
    const reloaded = newSession(store);
    await reloaded.resume();
    const state = await until(reloaded, (s) => s.phase === 'playing');

    expect(state.resuming).toBe(false);
    expect(state.client!.getView().viewerId).toBe('p1');
    expect(state.client!.getSnapshot().draft.movement[0]).toBe('FORWARD');
  });

  it('rejoins the lobby of a room that has not started', async () => {
    const store = new MemoryStore();
    const anne = newSession(store);
    await anne.createRoom('Anne');
    sockets.get(anne)!.disconnect();

    const reloaded = newSession(store);
    await reloaded.resume();
    const state = await until(reloaded, (s) => s.phase === 'lobby');

    expect(state.lobby?.seats[0].name).toBe('Anne');
    expect(state.resuming).toBe(false);
  });

  it('forgets a seat whose room no longer exists', async () => {
    const store = new MemoryStore();
    const anne = newSession(store);
    await anne.createRoom('Anne');
    sockets.get(anne)!.disconnect();
    server.rooms.closeAll('gone');

    const reloaded = newSession(store);
    await reloaded.resume();
    await until(reloaded, (s) => !s.resuming);

    expect(reloaded.getState().phase).toBe('menu');
    expect(store.data.size).toBe(0);
  });

  it('does nothing when there is no remembered seat', async () => {
    const fresh = newSession();

    await fresh.resume();

    expect(fresh.getState().phase).toBe('menu');
    expect(fresh.getState().connection).toBe('idle');
  });

  it('ignores a seat remembered for a different server', async () => {
    const store = new MemoryStore();
    store.setItem(
      'pirate:seat',
      JSON.stringify({ serverUrl: 'http://elsewhere:1', roomId: 'ABCDE', seatId: 'seat_x', token: 'tok_abcdef' }),
    );
    const fresh = newSession(store);

    await fresh.resume();

    expect(fresh.getState().phase).toBe('menu');
    expect(fresh.getState().connection).toBe('idle');
  });

  it('puts the older window back on the menu when a newer one takes the seat', async () => {
    const store = new MemoryStore();
    const first = newSession(store);
    await first.createRoom('Anne');

    const second = newSession(store);
    await second.resume();
    await until(second, (s) => s.phase === 'lobby');

    const state = await until(first, (s) => s.phase === 'menu');
    expect(state.message).toMatch(/another window/i);
  });
});
