import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameView } from '@pirate/game-core/view/GameView';
import type { LobbyState } from '@pirate/game-core/protocol/messages';
import type { GameServer } from '../src/gameServer';
import { TestClient, createRoom, expectOk, startServer } from './helpers';

let server: GameServer;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await server.close();
});

/** Starts a one-human match and returns the first view the host receives. */
async function viewOfNewMatch(options: object): Promise<GameView> {
  const host = await createRoom(server.port, 'Anne', {
    ais: 1,
    turnDurationSeconds: null,
    ...options,
  });
  clients.push(host.client);
  expectOk(await host.client.request('room:start'));
  return host.client.waitFor<GameView>('game:view');
}

describe('generated seas', () => {
  it('sends the board with the rocks, wind and whirlpools to the players', async () => {
    const view = await viewOfNewMatch({ mapStyle: 'stormy' });

    expect(Object.keys(view.obstacles).length).toBeGreaterThan(0);
    const kinds = new Set(Object.values(view.terrain).map((terrain) => terrain.kind));
    expect(kinds.has('wind') || kinds.has('whirlpool')).toBe(true);
    expect(Object.values(view.obstacles).every((obstacle) => obstacle.kind === 'rock')).toBe(true);
  });

  it('gives every match its own board', async () => {
    const boards = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const view = await viewOfNewMatch({ mapStyle: 'normal' });
      boards.add(JSON.stringify([view.obstacles, view.terrain]));
    }

    expect(boards.size).toBeGreaterThan(1);
  });

  it('lets the host choose the sea, and only the host', async () => {
    const host = await createRoom(server.port, 'Anne', { mapStyle: 'calm' });
    clients.push(host.client);
    expect(host.seat.lobby.options.mapStyle).toBe('calm');

    const result = await host.client.request<{ lobby: LobbyState }>('room:configure', {
      mapStyle: 'stormy',
    });
    expectOk(result);
    expect(result.lobby.options.mapStyle).toBe('stormy');

    expect(await host.client.request('room:configure', { mapStyle: 'tsunami' })).toMatchObject({
      ok: false,
      error: 'bad_request',
    });
  });

  it('defaults to a normal sea', async () => {
    const host = await createRoom(server.port, 'Anne');
    clients.push(host.client);
    expect(host.seat.lobby.options.mapStyle).toBe('normal');
  });
});
