import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameView } from '@pirate/game-core/view/GameView';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { JoinResult, LobbyState } from '@pirate/game-core/protocol/messages';
import type { GameServer } from '../src/gameServer';
import { TestClient, createRoom, expectOk, joinRoom, plan, startServer } from './helpers';

/** Short enough to wait for in a test, long enough to rejoin inside. */
const GRACE_MS = 250;

let server: GameServer;
const clients: TestClient[] = [];

function track<T extends { client: TestClient }>(entry: T): T {
  clients.push(entry.client);
  return entry;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  server = await startServer({ awayGraceMs: GRACE_MS });
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await server.close();
});

async function startedDuel() {
  const host = track(await createRoom(server.port, 'Anne', { ais: 0, turnDurationSeconds: null }));
  const guest = track(await joinRoom(server.port, host.seat.lobby.shareCode, 'Bart'));
  expectOk(await host.client.request('room:start'));
  await host.client.waitFor<GameView>('game:view');
  await guest.client.waitFor<GameView>('game:view');
  return { host, guest };
}

async function rejoin(entry: { seat: JoinResult }) {
  const back = await TestClient.connect(server.port);
  clients.push(back);
  const result = await back.request<JoinResult>('room:rejoin', {
    roomId: entry.seat.roomId,
    seatId: entry.seat.seatId,
    token: entry.seat.token,
  });
  return { back, result };
}

const bartIsAi = (view: GameView) => view.players.p2.controller === 'ai';

/** Waits until a condition holds (checked every 20 ms). */
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for a condition');
    }
    await pause(20);
  }
}

describe('a player who goes away', () => {
  it('gets an AI to sail their ship once the grace period has passed', async () => {
    const { host, guest } = await startedDuel();

    guest.client.close();

    const view = await host.client.waitFor<GameView>('game:view', bartIsAi);
    expect(view.players.p2.controller).toBe('ai');
    const lobby = await host.client.waitFor<LobbyState>('lobby:update', (state) =>
      state.seats.some((seat) => seat.name === 'Bart' && seat.aiControlled),
    );
    expect(lobby.seats.find((seat) => seat.name === 'Anne')?.aiControlled).toBe(false);
  });

  it('keeps command of the ship during the grace period', async () => {
    const { host, guest } = await startedDuel();

    guest.client.close();
    await pause(GRACE_MS / 3);

    expect(host.client.all<GameView>('game:view').some(bartIsAi)).toBe(false);
  });

  it('is not replaced if they come back in time', async () => {
    const { host, guest } = await startedDuel();
    guest.client.close();
    await pause(GRACE_MS / 4);

    const { result } = await rejoin(guest);
    expectOk(result);
    await pause(GRACE_MS * 2);

    expect(result.wasAiControlled).toBe(false);
    expect(host.client.all<GameView>('game:view').some(bartIsAi)).toBe(false);
  });

  it('does not hold up the others once the AI is in command', async () => {
    const { host, guest } = await startedDuel();
    guest.client.close();
    await host.client.waitFor<GameView>('game:view', bartIsAi);

    host.client.send('game:lockIn', plan([null, null, null, null]));

    const turn = await host.client.waitFor<{ events: GameEvent[] }>('game:turn');
    // The AI really sailed Bart's ship.
    expect(
      turn.events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p2-ship'),
    ).toBe(true);
  });

  it('ends a turn that was only waiting for them when the AI steps in', async () => {
    const { host, guest } = await startedDuel();
    host.client.send('game:lockIn', plan([null, null, null, null]));
    await host.client.waitFor<GameView>('game:view', (view) => view.self.lockedIn);

    guest.client.close();

    // No timer is running: only the takeover can end this turn.
    const turn = await host.client.waitFor<{ events: GameEvent[] }>('game:turn');
    expect(turn.events[0].type).toBe('TURN_STARTED');
  });

  it('does not wait for them to finish watching a turn either', async () => {
    const { host, guest } = await startedDuel();
    host.client.send('game:lockIn', plan([null, null, null, null]));
    guest.client.send('game:lockIn', plan([null, null, null, null]));
    await host.client.waitFor('game:turn');

    guest.client.close();
    host.client.send('game:ack');

    const next = await host.client.waitFor<GameView>('game:view', (view) => view.turn === 2);
    expect(next.status).toBe('planning');
  });
});

describe('a player who comes back after an AI stepped in', () => {
  it('takes the ship back, and is told an AI sailed for them', async () => {
    const { host, guest } = await startedDuel();
    guest.client.close();
    await host.client.waitFor<GameView>('game:view', bartIsAi);

    const { back, result } = await rejoin(guest);

    expectOk(result);
    expect(result.wasAiControlled).toBe(true);
    const view = await back.waitFor<GameView>('game:view');
    expect(view.players.p2.controller).toBe('human');
    const hostSees = await host.client.waitFor<GameView>(
      'game:view',
      (candidate) => candidate.players.p2.controller === 'human' && candidate.turn === 1,
    );
    expect(hostSees.players.p2.controller).toBe('human');
  });

  it('is in command at once: their plan is accepted and counts', async () => {
    const { host, guest } = await startedDuel();
    guest.client.close();
    await host.client.waitFor<GameView>('game:view', bartIsAi);
    const { back } = await rejoin(guest);
    await back.waitFor<GameView>('game:view');

    back.send('game:draft', plan(['FORWARD', null, null, null]));
    const view = await back.waitFor<GameView>(
      'game:view',
      (candidate) => candidate.self.queue[0] === 'FORWARD',
    );
    expect(view.self.queue[0]).toBe('FORWARD');
    expect(back.all('game:rejected')).toHaveLength(0);

    back.send('game:lockIn', plan(['FORWARD', null, null, null]));
    host.client.send('game:lockIn', plan([null, null, null, null]));
    const turn = await back.waitFor<{ events: GameEvent[] }>('game:turn');
    expect(
      turn.events.some((event) => event.type === 'SHIP_MOVED' && event.shipId === 'p2-ship'),
    ).toBe(true);
  });

  it('can be taken over again if they drop a second time', async () => {
    const { host, guest } = await startedDuel();
    const bart = () =>
      host.client.all<LobbyState>('lobby:update').at(-1)?.seats.find((seat) => seat.name === 'Bart');

    guest.client.close();
    await until(() => bart()?.aiControlled === true);

    const { back } = await rejoin(guest);
    await until(() => bart()?.connected === true && bart()?.aiControlled === false);

    back.close();
    await until(() => bart()?.aiControlled === true);
    expect(bart()).toMatchObject({ connected: false, aiControlled: true });
  });
});

describe('a player who leaves a running match', () => {
  it('is replaced by an AI straight away, with no grace period', async () => {
    await server.close();
    server = await startServer({ awayGraceMs: 60_000 });
    const { host, guest } = await startedDuel();

    guest.client.send('room:leave');

    const view = await host.client.waitFor<GameView>('game:view', bartIsAi);
    expect(view.players.p2.controller).toBe('ai');
  });

  it('cannot take the ship back, and the match carries on without them', async () => {
    const { host, guest } = await startedDuel();
    guest.client.send('room:leave');
    await host.client.waitFor<GameView>('game:view', bartIsAi);

    const { result } = await rejoin(guest);
    expect(result).toMatchObject({ ok: false });

    host.client.send('game:lockIn', plan([null, null, null, null]));
    const turn = await host.client.waitFor<{ events: GameEvent[] }>('game:turn');
    expect(turn.events.some((event) => event.type === 'SHIP_MOVED')).toBe(true);
  });
});

describe('cleaning up', () => {
  it('does not fire a takeover after the room has closed', async () => {
    const { guest } = await startedDuel();
    guest.client.close();
    await pause(GRACE_MS / 5);

    server.rooms.closeAll('done');
    await pause(GRACE_MS * 2);

    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(health.status).toBe(200);
  });
});
