import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  JoinResult,
  LobbyState,
  PublicRoomSummary,
} from '@pirate/game-core/protocol/messages';
import type { GameServer } from '../src/gameServer';
import { TestClient, createRoom, expectOk, joinRoom, startServer } from './helpers';

let server: GameServer;
const clients: TestClient[] = [];

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

const listRooms = async (origin?: string) => {
  const response = await fetch(`http://127.0.0.1:${server.port}/rooms`, {
    headers: origin ? { Origin: origin } : undefined,
  });
  return {
    response,
    rooms: ((await response.json()) as { rooms: PublicRoomSummary[] }).rooms,
  };
};

/** Tries to join with whatever string; returns the server's answer. */
async function tryJoin(code: string, name = 'Cara') {
  const client = await TestClient.connect(server.port);
  clients.push(client);
  return client.request<JoinResult>('room:join', { code, name });
}

describe('private rooms (the default)', () => {
  it('are private unless the host says otherwise', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    expect(host.seat.lobby.options.visibility).toBe('private');
  });

  it('are joined with a long key, not the short room code', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const { roomId, shareCode } = host.seat.lobby;

    expect(roomId).toMatch(/^[A-Z0-9]{5}$/);
    expect(shareCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(shareCode).not.toBe(roomId);
  });

  it('cannot be joined with the room code', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    const result = await tryJoin(host.seat.lobby.roomId);

    expect(result).toMatchObject({ ok: false, error: 'room_not_found' });
  });

  it('look exactly like a room that does not exist when the code is wrong', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    const privateRoom = await tryJoin(host.seat.lobby.roomId);
    const missing = await tryJoin('ZZZZZ');

    expect(privateRoom).toEqual(missing);
  });

  it('can be joined with the key, in any case', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    const result = await tryJoin(host.seat.lobby.shareCode.toLowerCase());

    expectOk(result);
    expect(result.roomId).toBe(host.seat.roomId);
  });

  it('never appear in the public list', async () => {
    track(await createRoom(server.port, 'Anne'));

    const { rooms } = await listRooms();

    expect(rooms).toEqual([]);
  });

  it('have different keys', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const host = track(await createRoom(server.port, `Host ${i}`));
      keys.add(host.seat.lobby.shareCode);
    }

    expect(keys.size).toBe(25);
  });
});

describe('public rooms', () => {
  const makePublic = (name = 'Anne', options: object = {}) =>
    createRoom(server.port, name, { visibility: 'public', ...options });

  it('are shared by their short code', async () => {
    const host = track(await makePublic());

    expect(host.seat.lobby.shareCode).toBe(host.seat.lobby.roomId);
    expect(host.seat.lobby.shareCode).toMatch(/^[A-Z0-9]{5}$/);
  });

  it('can be joined with the short code', async () => {
    const host = track(await makePublic());

    const bart = track(await joinRoom(server.port, host.seat.lobby.roomId, 'Bart'));

    expect(bart.seat.roomId).toBe(host.seat.roomId);
    expect(bart.seat.lobby.seats.map((seat) => seat.name)).toEqual(['Anne', 'Bart']);
  });

  it('are listed with what a player needs to choose one', async () => {
    const host = track(
      await makePublic('Anne', { ais: 2, aiDifficulty: 'hard', teamMode: 'teams', turnDurationSeconds: 45 }),
    );

    const { rooms } = await listRooms();

    expect(rooms).toEqual([
      {
        code: host.seat.lobby.roomId,
        hostName: 'Anne',
        players: 1,
        maxPlayers: 8,
        ais: 2,
        aiDifficulty: 'hard',
        teamMode: 'teams',
        turnDurationSeconds: 45,
      },
    ]);
  });

  it('never leak any seat secret in the list', async () => {
    const host = track(await makePublic());
    const text = await (await fetch(`http://127.0.0.1:${server.port}/rooms`)).text();

    expect(text).not.toContain(host.seat.token);
    expect(text).not.toContain(host.seat.seatId);
  });

  it('show the number of players as people join', async () => {
    const host = track(await makePublic());
    track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));

    const { rooms } = await listRooms();

    expect(rooms[0].players).toBe(2);
  });

  it('list the newest first', async () => {
    const first = track(await makePublic('First'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = track(await makePublic('Second'));

    const { rooms } = await listRooms();

    expect(rooms.map((room) => room.hostName)).toEqual(['Second', 'First']);
    expect(rooms.map((room) => room.code)).toEqual([
      second.seat.roomId,
      first.seat.roomId,
    ]);
  });

  it('disappear from the list once the match has started', async () => {
    const host = track(await makePublic('Anne', { ais: 1, turnDurationSeconds: null }));
    expect((await listRooms()).rooms).toHaveLength(1);

    expectOk(await host.client.request('room:start'));

    expect((await listRooms()).rooms).toEqual([]);
  });

  it('disappear from the list when they are full', async () => {
    const host = track(await makePublic('Anne', { ais: 14 })); // room for two humans
    expect((await listRooms()).rooms).toHaveLength(1);

    track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));

    expect((await listRooms()).rooms).toEqual([]);
  });

  it('disappear from the list when nobody is there any more', async () => {
    const host = track(await makePublic());
    host.client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect((await listRooms()).rooms).toEqual([]);
  });

  it('are not listed while the host is away but another player is still there', async () => {
    const host = track(await makePublic());
    const bart = track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));
    host.client.close();
    await bart.client.waitFor<LobbyState>('lobby:update', (lobby) =>
      lobby.seats.some((seat) => seat.name === 'Bart' && seat.isHost),
    );

    const { rooms } = await listRooms();

    expect(rooms[0].hostName).toBe('Bart');
    expect(rooms[0].players).toBe(1);
  });
});

describe('changing visibility', () => {
  it('lets the host publish a room, and the code replaces the key as what to share', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const bart = track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));
    const key = host.seat.lobby.shareCode;

    const result = await host.client.request<{ lobby: LobbyState }>('room:configure', {
      visibility: 'public',
    });

    expectOk(result);
    expect(result.lobby.shareCode).toBe(host.seat.lobby.roomId);
    const seen = await bart.client.waitFor<LobbyState>(
      'lobby:update',
      (lobby) => lobby.options.visibility === 'public',
    );
    expect(seen.shareCode).toBe(host.seat.lobby.roomId);
    expect((await listRooms()).rooms).toHaveLength(1);
    // The old key still opens the room.
    expectOk(await tryJoin(key));
  });

  it('lets the host make a room private again: it leaves the list and the code stops working', async () => {
    const host = track(await createRoom(server.port, 'Anne', { visibility: 'public' }));
    const code = host.seat.lobby.roomId;
    expect(await tryJoin(code)).toMatchObject({ ok: true });
    expect((await listRooms()).rooms).toHaveLength(1);

    const result = await host.client.request<{ lobby: LobbyState }>('room:configure', {
      visibility: 'private',
    });

    expectOk(result);
    expect(result.lobby.shareCode).toMatch(/^[A-Z0-9]{8}$/);
    expect((await listRooms()).rooms).toEqual([]);
    expect(await tryJoin(code)).toMatchObject({ ok: false, error: 'room_not_found' });
    expectOk(await tryJoin(result.lobby.shareCode));
  });

  it('only the host can change it', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const bart = track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));

    expect(
      await bart.client.request('room:configure', { visibility: 'public' }),
    ).toMatchObject({ ok: false, error: 'not_host' });
    expect((await listRooms()).rooms).toEqual([]);
  });

  it('rejects a visibility that does not exist', async () => {
    const host = track(await createRoom(server.port, 'Anne'));

    expect(
      await host.client.request('room:configure', { visibility: 'secret' }),
    ).toMatchObject({ ok: false, error: 'bad_request' });
  });

  it('does not affect a player who comes back to their seat', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    await host.client.request('room:configure', { visibility: 'public' });
    host.client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const back = await TestClient.connect(server.port);
    clients.push(back);
    const result = await back.request<JoinResult>('room:rejoin', {
      roomId: host.seat.roomId,
      seatId: host.seat.seatId,
      token: host.seat.token,
    });

    expectOk(result);
    expect(result.lobby.options.visibility).toBe('public');
  });
});

describe('the room list over HTTP', () => {
  it('allows the client site to read it', async () => {
    await server.close();
    server = await startServer({ clientOrigins: ['https://game.example.com'] });

    const { response } = await listRooms('https://game.example.com');

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://game.example.com');
    expect(response.headers.get('vary')).toMatch(/origin/i);
  });

  it('does not let other websites read it', async () => {
    await server.close();
    server = await startServer({ clientOrigins: ['https://game.example.com'] });

    const { response } = await listRooms('https://evil.example.com');

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('is not cached', async () => {
    const { response } = await listRooms();

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('is empty when there are no rooms', async () => {
    expect((await listRooms()).rooms).toEqual([]);
  });
});

describe('guessing codes', () => {
  it('stops answering a connection that keeps getting codes wrong', async () => {
    const client = await TestClient.connect(server.port);
    clients.push(client);

    for (let i = 0; i < 8; i += 1) {
      expect(await client.request('room:join', { code: `WRONG${i}`, name: 'Cara' })).toMatchObject({
        ok: false,
        error: 'room_not_found',
      });
    }

    expect(await client.request('room:join', { code: 'WRONG9', name: 'Cara' })).toMatchObject({
      ok: false,
      error: 'too_many_attempts',
    });
  });

  it('then refuses even a correct key', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const client = await TestClient.connect(server.port);
    clients.push(client);
    for (let i = 0; i < 8; i += 1) {
      await client.request('room:join', { code: `WRONG${i}`, name: 'Cara' });
    }

    const result = await client.request('room:join', {
      code: host.seat.lobby.shareCode,
      name: 'Cara',
    });

    expect(result).toMatchObject({ ok: false, error: 'too_many_attempts' });
  });

  it('counts a private room code as a wrong guess', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const client = await TestClient.connect(server.port);
    clients.push(client);

    for (let i = 0; i < 8; i += 1) {
      await client.request('room:join', { code: host.seat.lobby.roomId, name: 'Cara' });
    }

    expect(
      await client.request('room:join', { code: host.seat.lobby.shareCode, name: 'Cara' }),
    ).toMatchObject({ error: 'too_many_attempts' });
  });

  it('does not penalise joining a room that exists', async () => {
    const host = track(await createRoom(server.port, 'Anne', { visibility: 'public' }));
    for (let i = 0; i < 3; i += 1) {
      const guest = await TestClient.connect(server.port);
      clients.push(guest);
      expectOk(await guest.request('room:join', { code: host.seat.lobby.roomId, name: `G${i}` }));
    }
  });

  it('is counted per connection, so another connection is unaffected', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const guesser = await TestClient.connect(server.port);
    clients.push(guesser);
    for (let i = 0; i < 8; i += 1) {
      await guesser.request('room:join', { code: `WRONG${i}`, name: 'Cara' });
    }

    expectOk(await tryJoin(host.seat.lobby.shareCode, 'Dina'));
  });

  it('does not count a malformed code (that is a typo, not a guess)', async () => {
    const client = await TestClient.connect(server.port);
    clients.push(client);
    for (let i = 0; i < 12; i += 1) {
      expect(await client.request('room:join', { code: '!', name: 'Cara' })).toMatchObject({
        error: 'bad_request',
      });
    }
  });
});

describe('cleaning up', () => {
  it('a swept room cannot be joined with its key any more', async () => {
    const host = track(await createRoom(server.port, 'Anne'));
    const key = host.seat.lobby.shareCode;
    host.client.send('room:leave');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.rooms.sweep()).toBe(1);

    expect(await tryJoin(key)).toMatchObject({ ok: false, error: 'room_not_found' });
  });
});
