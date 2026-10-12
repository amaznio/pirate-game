import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameView } from '@pirate/game-core/view/GameView';
import type { LobbyState } from '@pirate/game-core/protocol/messages';
import type { GameServer } from '../src/gameServer';
import { TestClient, createRoom, expectOk, joinRoom, startServer } from './helpers';

let server: GameServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await server.close();
});

const shipsOf = (view: GameView) =>
  Object.fromEntries(
    Object.values(view.players).map((player) => [
      player.id,
      view.ships[player.shipId].shipTypeId,
    ]),
  );

describe('choosing a ship in the lobby', () => {
  it('starts every seat as a sloop, and the AIs too', async () => {
    const host = await createRoom(server.port, 'Anne');
    clients.push(host.client);

    expect(host.seat.lobby.seats[0].shipTypeId).toBe('sloop');
    expect(host.seat.lobby.options.aiShipTypeId).toBe('sloop');
  });

  it('lets each player pick their own ship, and tells the whole room', async () => {
    const host = await createRoom(server.port, 'Anne', { visibility: 'public' });
    clients.push(host.client);
    const guest = await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart');
    clients.push(guest.client);

    const result = await guest.client.request<{ lobby: LobbyState }>('room:ship', 'galleon');
    expectOk(result);

    const seat = (lobby: LobbyState, name: string) =>
      lobby.seats.find((candidate) => candidate.name === name)?.shipTypeId;
    expect(seat(result.lobby, 'Bart')).toBe('galleon');
    expect(seat(result.lobby, 'Anne')).toBe('sloop');

    // The host hears about it too (earlier updates, from Bart joining, do not match).
    const update = await host.client.waitFor<LobbyState>(
      'lobby:update',
      (lobby) => seat(lobby, 'Bart') === 'galleon',
    );
    expect(seat(update, 'Anne')).toBe('sloop');
  });

  it('refuses a ship that does not exist', async () => {
    const host = await createRoom(server.port, 'Anne');
    clients.push(host.client);

    for (const bad of ['raft', 'toString', 7, null]) {
      expect(await host.client.request('room:ship', bad)).toMatchObject({
        ok: false,
        error: 'bad_request',
      });
    }
  });

  it('puts the chosen ships in the match, humans first and the AIs after', async () => {
    const host = await createRoom(server.port, 'Anne', {
      ais: 2,
      aiShipTypeId: 'brigantine',
      turnDurationSeconds: null,
      visibility: 'public',
    });
    clients.push(host.client);
    const guest = await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart');
    clients.push(guest.client);
    expectOk(await host.client.request('room:ship', 'galleon'));
    expectOk(await guest.client.request('room:ship', 'sloop'));

    expectOk(await host.client.request('room:start'));
    const view = await host.client.waitFor<GameView>('game:view');

    expect(Object.values(shipsOf(view))).toEqual(['galleon', 'sloop', 'brigantine', 'brigantine']);
    expect(view.ships[view.self.shipId].maxHp).toBe(6);
    expect(view.self.tokens.FORWARD).toBe(8);
  });

  it('lets the host choose what the AIs sail, and only the host', async () => {
    const host = await createRoom(server.port, 'Anne', { visibility: 'public' });
    clients.push(host.client);
    const guest = await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart');
    clients.push(guest.client);

    const result = await host.client.request<{ lobby: LobbyState }>('room:configure', {
      aiShipTypeId: 'galleon',
    });
    expectOk(result);
    expect(result.lobby.options.aiShipTypeId).toBe('galleon');

    expect(await guest.client.request('room:configure', { aiShipTypeId: 'brigantine' })).toMatchObject({
      ok: false,
      error: 'not_host',
    });
    expect(await host.client.request('room:configure', { aiShipTypeId: 'raft' })).toMatchObject({
      ok: false,
      error: 'bad_request',
    });
  });

  it('cannot change ship once the match has started', async () => {
    const host = await createRoom(server.port, 'Anne', { ais: 1, turnDurationSeconds: null });
    clients.push(host.client);
    expectOk(await host.client.request('room:start'));

    expect(await host.client.request('room:ship', 'galleon')).toMatchObject({
      ok: false,
      error: 'already_started',
    });
  });
});
