import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameView } from '@pirate/game-core/view/GameView';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { JoinResult, LobbyState } from '@pirate/game-core/protocol/messages';
import type { GameServer } from '../src/gameServer';
import {
  TestClient,
  createRoom,
  expectOk,
  joinRoom,
  noFire,
  plan,
  startServer,
} from './helpers';

let server: GameServer;
const clients: TestClient[] = [];

/** Tracks a client so it is closed after the test. */
function track<T extends { client: TestClient }>(entry: T): T {
  clients.push(entry.client);
  return entry;
}

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await server.close();
});

/** Two humans in a started match with no timer, so tests control the pace. */
async function startedDuel() {
  const host = track(await createRoom(server.port, 'Anne', {
    ais: 0,
    turnDurationSeconds: null,
  }));
  const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));
  const started = await host.client.request('room:start');
  expectOk(started);
  const hostView = await host.client.waitFor<GameView>('game:view');
  const guestView = await guest.client.waitFor<GameView>('game:view');
  return { host, guest, hostView, guestView };
}

describe('http', () => {
  it('answers the health check', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', rooms: 0 });
  });

  it('404s anything else', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/nope`);

    expect(response.status).toBe(404);
  });

  it('reports how many rooms are open', async () => {
    track(await createRoom(server.port, 'Anne'));

    const body = (await (
      await fetch(`http://127.0.0.1:${server.port}/health`)
    ).json()) as { rooms: number };
    expect(body.rooms).toBe(1);
  });
});

describe('creating and joining rooms', () => {
  it('creates a room and makes the creator the host', async () => {
    const { seat } = track(await createRoom(server.port, 'Anne'));

    expect(seat.roomId).toMatch(/^[A-Z0-9]{5}$/);
    expect(seat.token.length).toBeGreaterThan(20);
    expect(seat.lobby.status).toBe('lobby');
    expect(seat.lobby.seats).toHaveLength(1);
    expect(seat.lobby.seats[0]).toMatchObject({ name: 'Anne', isHost: true, connected: true });
  });

  it('lets a second player join and tells everyone', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));

    const lobby = await host.client.waitFor<LobbyState>(
      'lobby:update',
      (state) => state.seats.length === 2,
    );

    expect(lobby.seats.map((seat) => seat.name)).toEqual(['Anne', 'Bart']);
    expect(guest.seat.lobby.seats).toHaveLength(2);
    expect(lobby.seats[1].isHost).toBe(false);
  });

  it('accepts a room code in any case', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    const guest = track(await joinRoom(server.port, host.seat.roomId.toLowerCase(), 'Bart'));

    expect(guest.seat.roomId).toBe(host.seat.roomId);
  });

  it('refuses unknown rooms, bad codes and bad names', async () => {
    const client = await TestClient.connect(server.port);
    clients.push(client);

    expect(await client.request('room:join', { roomId: 'ZZZZZ', name: 'Bart' })).toMatchObject({
      ok: false,
      error: 'room_not_found',
    });
    expect(await client.request('room:join', { roomId: '!!', name: 'Bart' })).toMatchObject({
      ok: false,
      error: 'bad_request',
    });
    expect(await client.request('room:create', { name: '   ' })).toMatchObject({
      ok: false,
      error: 'bad_request',
    });
    expect(await client.request('room:create', null)).toMatchObject({ ok: false });
  });

  it('refuses invalid room options', async () => {
    const client = await TestClient.connect(server.port);
    clients.push(client);

    const result = await client.request('room:create', {
      name: 'Anne',
      options: { ais: 500 },
    });

    expect(result).toMatchObject({ ok: false, error: 'bad_request' });
  });

  it('does not let a connection hold two seats', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    const again = await host.client.request('room:create', { name: 'Anne' });

    expect(again).toMatchObject({ ok: false, error: 'bad_request' });
  });

  it('stops filling when the room has no space left', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 15 }));

    const guest = await TestClient.connect(server.port);
    clients.push(guest);
    const result = await guest.request('room:join', {
      roomId: host.seat.roomId,
      name: 'Bart',
    });

    expect(result).toMatchObject({ ok: false, error: 'room_full' });
  });

  it('refuses to create rooms once the server is full', async () => {
    await server.close();
    server = await startServer({ maxRooms: 1 });
    track(await createRoom(server.port, 'Anne'));

    const client = await TestClient.connect(server.port);
    clients.push(client);

    expect(await client.request('room:create', { name: 'Bart' })).toMatchObject({
      ok: false,
      error: 'server_busy',
    });
  });
});

describe('the lobby', () => {
  it('lets only the host configure and start', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));

    expect(await guest.client.request('room:start')).toMatchObject({
      ok: false,
      error: 'not_host',
    });
    expect(await guest.client.request('room:configure', { ais: 3 })).toMatchObject({
      ok: false,
      error: 'not_host',
    });
  });

  it('lets the host change the options and tells everyone', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));

    const result = await host.client.request<{ lobby: LobbyState }>('room:configure', {
      ais: 3,
      teamMode: 'teams',
    });

    expectOk(result);
    expect(result.lobby.options).toMatchObject({ ais: 3, teamMode: 'teams' });
    const seen = await guest.client.waitFor<LobbyState>(
      'lobby:update',
      (lobby) => lobby.options.ais === 3,
    );
    expect(seen.options.teamMode).toBe('teams');
  });

  it('keeps the old options when the new ones are invalid', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 2 }));

    expect(await host.client.request('room:configure', { teamMode: 'chaos' })).toMatchObject({
      ok: false,
      error: 'bad_request',
    });
    const retry = await host.client.request<{ lobby: LobbyState }>('room:configure', {});
    expectOk(retry);
    expect(retry.lobby.options.ais).toBe(2);
  });

  it('will not start a match with fewer than two ships', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 0 }));

    expect(await host.client.request('room:start')).toMatchObject({
      ok: false,
      error: 'too_few_ships',
    });
  });

  it('hands the host role on when the host leaves the lobby', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));

    host.client.close();

    const lobby = await guest.client.waitFor<LobbyState>(
      'lobby:update',
      (state) => state.seats.some((seat) => seat.name === 'Bart' && seat.isHost),
    );
    expect(lobby.seats.find((seat) => seat.name === 'Anne')?.connected).toBe(false);
  });
});

describe('starting a match', () => {
  it('starts for everyone and gives each player their own view', async () => {
    const { host, guest, hostView, guestView } = await startedDuel();

    const hostStarted = await host.client.waitFor<{ playerId: string }>('game:started');
    const guestStarted = await guest.client.waitFor<{ playerId: string }>('game:started');

    expect(hostStarted.playerId).toBe('p1');
    expect(guestStarted.playerId).toBe('p2');
    expect(hostView.viewerId).toBe('p1');
    expect(guestView.viewerId).toBe('p2');
    expect(hostView.players.p1.name).toBe('Anne');
    expect(hostView.players.p2.name).toBe('Bart');
    expect(hostView.status).toBe('planning');
  });

  it('keeps one player plan out of the other player view', async () => {
    const { host, guest } = await startedDuel();

    host.client.send('game:draft', plan(['FORWARD', 'TURN_LEFT', null, null]));
    const guestSees = await guest.client.waitFor<GameView>(
      'game:view',
      (view) => view.players.p1.activity > 0,
    );

    const wire = JSON.stringify(guestSees);
    expect(guestSees.self.id).toBe('p2');
    expect(guestSees.players.p1.activity).toBeGreaterThan(0);
    expect(wire).not.toContain('"queue":["FORWARD","TURN_LEFT"');
    expect(Object.keys(guestSees.players.p1)).not.toContain('tokens');
    expect(Object.keys(guestSees.players.p1)).not.toContain('queue');
  });

  it('refuses a late join and a second start', async () => {
    const { host } = await startedDuel();
    const late = await TestClient.connect(server.port);
    clients.push(late);

    expect(
      await late.request('room:join', { roomId: host.seat.roomId, name: 'Cara' }),
    ).toMatchObject({ ok: false, error: 'already_started' });
    expect(await host.client.request('room:start')).toMatchObject({
      ok: false,
      error: 'already_started',
    });
  });

  it('leaves out players who dropped before the start', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 1, turnDurationSeconds: null }));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));
    guest.client.close();
    await host.client.waitFor<LobbyState>(
      'lobby:update',
      (lobby) => lobby.seats.some((seat) => seat.name === 'Bart' && !seat.connected),
    );

    expect(await host.client.request('room:start')).toMatchObject({ ok: true });

    const view = await host.client.waitFor<GameView>('game:view');
    expect(Object.keys(view.players)).toEqual(['p1', 'p2']);
    expect(view.players.p2.controller).toBe('ai');
  });
});

describe('playing a turn', () => {
  it('stores a draft and echoes it back to its owner only', async () => {
    const { host } = await startedDuel();

    host.client.send('game:draft', plan(['FORWARD', null, 'TURN_RIGHT', null]));

    const view = await host.client.waitFor<GameView>(
      'game:view',
      (candidate) => candidate.self.queue[0] === 'FORWARD',
    );
    expect(view.self.queue).toEqual(['FORWARD', null, 'TURN_RIGHT', null]);
    expect(view.self.lockedIn).toBe(false);
  });

  it('resolves when everyone locks in and sends the events to both', async () => {
    const { host, guest } = await startedDuel();

    host.client.send('game:lockIn', plan(['FORWARD', null, null, null]));
    guest.client.send('game:lockIn', plan([null, null, null, null]));

    const hostTurn = await host.client.waitFor<{ events: GameEvent[] }>('game:turn');
    const guestTurn = await guest.client.waitFor<{ events: GameEvent[] }>('game:turn');

    expect(hostTurn.events[0].type).toBe('TURN_STARTED');
    expect(hostTurn.events[hostTurn.events.length - 1].type).toBe('TURN_ENDED');
    expect(guestTurn.events).toEqual(hostTurn.events);
    expect(
      hostTurn.events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p1-ship'),
    ).toBe(true);

    const animating = await host.client.waitFor<GameView>(
      'game:view',
      (view) => view.status === 'animating',
    );
    expect(animating.turn).toBe(1);
  });

  it('starts the next turn once every player has acknowledged', async () => {
    const { host, guest } = await startedDuel();
    host.client.send('game:lockIn', plan([null, null, null, null]));
    guest.client.send('game:lockIn', plan([null, null, null, null]));
    await host.client.waitFor('game:turn');

    host.client.send('game:ack');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.client.all<GameView>('game:view').some((view) => view.turn === 2)).toBe(
      false,
    );

    guest.client.send('game:ack');
    const next = await host.client.waitFor<GameView>('game:view', (view) => view.turn === 2);
    expect(next.status).toBe('planning');
    expect(next.self.lockedIn).toBe(false);
  });

  it('resolves straight away for a human against an AI', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 1, turnDurationSeconds: null }));
    await host.client.request('room:start');
    await host.client.waitFor<GameView>('game:view');

    host.client.send('game:lockIn', plan(['FORWARD', null, null, null]));

    const turn = await host.client.waitFor<{ events: GameEvent[] }>('game:turn');
    expect(turn.events.some((event) => event.type === 'SHIP_MOVED')).toBe(true);
  });

  it('tells a player when a plan is refused and does not lock them in', async () => {
    const { host } = await startedDuel();

    host.client.send('game:lockIn', plan(['TURN_RIGHT', 'TURN_RIGHT', null, null]));

    const rejected = await host.client.waitFor<{ reason: string }>('game:rejected');
    expect(rejected.reason).toBe('not_enough_tokens');
    host.client.send('game:draft', plan(['FORWARD', null, null, null]));
    const view = await host.client.waitFor<GameView>(
      'game:view',
      (candidate) => candidate.self.queue[0] === 'FORWARD',
    );
    expect(view.self.lockedIn).toBe(false);
  });

  it('changes how the next token is chosen', async () => {
    const { host } = await startedDuel();

    host.client.send('game:tokens', { auto: false, requested: 'TURN_RIGHT' });

    const view = await host.client.waitFor<GameView>(
      'game:view',
      (candidate) => !candidate.self.tokenGeneration.auto,
    );
    expect(view.self.tokenGeneration.requested).toBe('TURN_RIGHT');
  });

  it('sends the countdown as seconds remaining, not as a timestamp', async () => {
    const host = track(await createRoom(server.port, 'Anne', { ais: 0, turnDurationSeconds: 10 }));
    const guest = track(await joinRoom(server.port, host.seat.roomId, 'Bart'));
    await host.client.request('room:start');

    const hostView = await host.client.waitFor<GameView>('game:view');
    const guestView = await guest.client.waitFor<GameView>('game:view');

    expect(hostView.planningSecondsRemaining).toBeGreaterThan(8);
    expect(hostView.planningSecondsRemaining).toBeLessThanOrEqual(10);
    expect(guestView.planningSecondsRemaining).toBeLessThanOrEqual(10);
  });

  it('sends no countdown when the timer is switched off', async () => {
    const { hostView } = await startedDuel();

    expect(hostView.planningSecondsRemaining).toBeNull();
  });
});

describe('bad input', () => {
  it('ignores malformed messages and keeps serving', async () => {
    const { host } = await startedDuel();

    host.client.send('game:draft', 'not a plan');
    host.client.send('game:draft', { movement: ['SPIN', null, null, null], cannons: noFire() });
    host.client.send('game:lockIn', null);
    host.client.send('game:tokens', { auto: 'maybe' });
    host.client.send('game:unknown', { anything: true });

    host.client.send('game:draft', plan(['FORWARD', null, null, null]));
    const view = await host.client.waitFor<GameView>(
      'game:view',
      (candidate) => candidate.self.queue[0] === 'FORWARD',
    );
    expect(view.self.queue[0]).toBe('FORWARD');
    expect(host.client.all('game:rejected')).toHaveLength(0);
  });

  it('ignores match messages from someone who is not in a room', async () => {
    const stranger = await TestClient.connect(server.port);
    clients.push(stranger);

    stranger.send('game:lockIn', plan([null, null, null, null]));
    stranger.send('game:ack');

    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(health.status).toBe(200);
  });

  it('disconnects a connection that floods the server', async () => {
    const flooder = await TestClient.connect(server.port);
    clients.push(flooder);
    const closed = new Promise<void>((resolve) => flooder.socket.once('disconnect', () => resolve()));

    for (let i = 0; i < 400; i += 1) {
      flooder.send('game:ack');
    }

    await closed;
    expect(flooder.socket.connected).toBe(false);
  });
});

describe('reconnecting', () => {
  it('restores a seat and its draft after the connection drops', async () => {
    const { host, guest } = await startedDuel();
    guest.client.send('game:draft', plan(['FORWARD', 'FORWARD', null, null]));
    await guest.client.waitFor<GameView>(
      'game:view',
      (view) => view.self.queue[0] === 'FORWARD',
    );

    guest.client.close();
    await host.client.waitFor<LobbyState>(
      'lobby:update',
      (lobby) => lobby.seats.some((seat) => seat.name === 'Bart' && !seat.connected),
    );

    const back = await TestClient.connect(server.port);
    clients.push(back);
    const result = await back.request<JoinResult>('room:rejoin', {
      roomId: guest.seat.roomId,
      seatId: guest.seat.seatId,
      token: guest.seat.token,
    });
    expectOk(result);

    const started = await back.waitFor<{ playerId: string }>('game:started');
    const view = await back.waitFor<GameView>('game:view');
    expect(started.playerId).toBe('p2');
    expect(view.viewerId).toBe('p2');
    expect(view.self.queue).toEqual(['FORWARD', 'FORWARD', null, null]);
    const lobby = await host.client.waitFor<LobbyState>(
      'lobby:update',
      (state) => state.seats.length === 2 && state.seats.every((seat) => seat.connected),
    );
    expect(lobby.seats.map((seat) => seat.name)).toEqual(['Anne', 'Bart']);
  });

  it('replays the turn being animated to a player who comes back mid-turn', async () => {
    const { host, guest } = await startedDuel();
    host.client.send('game:lockIn', plan([null, null, null, null]));
    guest.client.send('game:lockIn', plan(['FORWARD', null, null, null]));
    await guest.client.waitFor('game:turn');

    guest.client.close();
    const back = await TestClient.connect(server.port);
    clients.push(back);
    await back.request('room:rejoin', {
      roomId: guest.seat.roomId,
      seatId: guest.seat.seatId,
      token: guest.seat.token,
    });

    const replay = await back.waitFor<{ events: GameEvent[] }>('game:turn');
    expect(replay.events[0].type).toBe('TURN_STARTED');
    const view = await back.waitFor<GameView>('game:view');
    expect(view.status).toBe('animating');
  });

  it('does not wait for a player who left during the animation', async () => {
    const { host, guest } = await startedDuel();
    host.client.send('game:lockIn', plan([null, null, null, null]));
    guest.client.send('game:lockIn', plan([null, null, null, null]));
    await host.client.waitFor('game:turn');

    guest.client.close();
    host.client.send('game:ack');

    const next = await host.client.waitFor<GameView>('game:view', (view) => view.turn === 2);
    expect(next.status).toBe('planning');
  });

  it('refuses wrong credentials without saying which part was wrong', async () => {
    const { guest } = await startedDuel();
    const stranger = await TestClient.connect(server.port);
    clients.push(stranger);

    const wrongToken = await stranger.request('room:rejoin', {
      roomId: guest.seat.roomId,
      seatId: guest.seat.seatId,
      token: 'wrong-token-value',
    });
    const wrongSeat = await stranger.request('room:rejoin', {
      roomId: guest.seat.roomId,
      seatId: 'seat_nope',
      token: guest.seat.token,
    });

    expect(wrongToken).toMatchObject({ ok: false, error: 'bad_credentials' });
    expect(wrongSeat).toMatchObject({ ok: false, error: 'bad_credentials' });
    expect(wrongToken).toEqual(wrongSeat);
  });

  it('lets the newest connection take over a seat', async () => {
    const { guest } = await startedDuel();
    const second = await TestClient.connect(server.port);
    clients.push(second);

    const result = await second.request('room:rejoin', {
      roomId: guest.seat.roomId,
      seatId: guest.seat.seatId,
      token: guest.seat.token,
    });

    expectOk(result);
    const closed = await guest.client.waitFor<{ reason: string }>('room:closed');
    expect(closed.reason).toMatch(/another window/i);
    await second.waitFor<GameView>('game:view');
  });

  it('says so when the room no longer exists', async () => {
    const client = await TestClient.connect(server.port);
    clients.push(client);

    const result = await client.request('room:rejoin', {
      roomId: 'ZZZZZ',
      seatId: 'seat_abcdef',
      token: 'token_abcdef',
    });

    expect(result).toMatchObject({ ok: false, error: 'room_not_found' });
  });
});

describe('cleaning up', () => {
  it('drops a room that has been empty for too long', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    host.client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.rooms.sweep(Date.now() + 61_000)).toBe(1);

    expect(server.rooms.get(host.seat.roomId)).toBeUndefined();
  });

  it('keeps a recently emptied room so its players can come back', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    host.client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.rooms.sweep(Date.now() + 1000)).toBe(0);
    expect(server.rooms.get(host.seat.roomId)).toBeDefined();
  });

  it('never drops a room that still has someone in it', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    expect(server.rooms.sweep(Date.now() + 10 * 60_000)).toBe(0);
    expect(server.rooms.get(host.seat.roomId)).toBeDefined();
  });

  it('tells players when the server shuts down', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const closed = host.client.waitFor<{ reason: string }>('room:closed');

    await server.close();

    expect((await closed).reason).toMatch(/shutting down/i);
    server = await startServer();
  });
});
