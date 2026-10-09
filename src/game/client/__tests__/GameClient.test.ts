import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../events/EventBus';
import { GameController } from '../../controller/GameController';
import { createSkirmishConfig } from '../../config/matchConfig';
import { GameClient } from '../GameClient';
import { LocalTransport } from '../LocalTransport';

afterEach(() => {
  vi.useRealTimers();
});

const NO_FIRE = Array.from({ length: 4 }, () => ({ left: false, right: false }));

function setup(
  options: { humans?: number; ais?: number; turnDurationMs?: number | null } = {},
) {
  const bus = new EventBus();
  const host = new GameController(bus, {
    turnDurationMs: options.turnDurationMs ?? null,
    config: createSkirmishConfig({
      humans: options.humans ?? 1,
      ais: options.ais ?? 1,
      teamMode: 'ffa',
    }),
  });
  const transport = new LocalTransport(host, bus, 'p1');
  const client = new GameClient(transport);
  return { host, bus, transport, client };
}

describe('editing the draft', () => {
  it('edits instantly on the client and shares the draft with the host', () => {
    const { host, client } = setup();

    client.queueToken('FORWARD');

    expect(client.getSnapshot().draft.movement[0]).toBe('FORWARD');
    expect(host.getState().players.p1.queue[0]).toBe('FORWARD');
    expect(host.getState().players.p1.lockedIn).toBe(false);
  });

  it('spends no real tokens until the turn resolves', () => {
    const { host, client } = setup();
    const pool = host.getState().players.p1.tokens.FORWARD;

    client.queueToken('FORWARD');

    expect(host.getState().players.p1.tokens.FORWARD).toBe(pool);
    expect(client.getSnapshot().tokensLeft.FORWARD).toBe(pool - 1);
  });

  it('removes, toggles and clears', () => {
    const { client } = setup();
    client.queueToken('FORWARD');
    client.toggleCannon(0, 'left');

    expect(client.getSnapshot().ammoLeft).toBe(client.getView().self.ammo - 1);

    client.removeToken(0);
    expect(client.getSnapshot().draft.movement[0]).toBeNull();

    client.clearDraft();
    expect(client.getSnapshot().draft.cannons[0].left).toBe(false);
  });

  it('notifies subscribers when the draft changes', () => {
    const { client } = setup();
    const seen: number[] = [];
    client.subscribe((snapshot) =>
      seen.push(snapshot.draft.movement.filter(Boolean).length),
    );

    client.queueToken('FORWARD');
    client.queueToken('TURN_LEFT');

    // Each edit emits once locally and once more when the host echoes a view.
    expect(seen).toContain(1);
    expect(seen[seen.length - 1]).toBe(2);
  });

  it('keeps its own draft when the host echoes a view back', () => {
    const { client } = setup();
    client.queueToken('FORWARD');
    client.queueToken('FORWARD');
    client.setTokenGeneration({ auto: false });

    expect(client.getSnapshot().draft.movement.slice(0, 2)).toEqual([
      'FORWARD',
      'FORWARD',
    ]);
  });
});

describe('locking in and the turn cycle', () => {
  it('sends the draft as the final plan and resolves the turn', () => {
    const { host, client } = setup();
    client.queueToken('FORWARD');

    client.lockIn();

    const moved = host
      .getPendingTurn()
      ?.events.some(
        (event) => event.type === 'SHIP_MOVED' && event.shipId === 'p1-ship',
      );
    expect(moved).toBe(true);
    expect(client.getView().status).toBe('animating');
  });

  it('freezes the draft once locked in', () => {
    const { client } = setup({ humans: 2, ais: 0 });
    client.queueToken('FORWARD');
    client.lockIn();

    expect(client.getSnapshot().canEdit).toBe(false);
    client.queueToken('TURN_LEFT');
    client.toggleCannon(0, 'left');

    expect(client.getSnapshot().draft.movement).toEqual([
      'FORWARD',
      null,
      null,
      null,
    ]);
    expect(client.getSnapshot().draft.cannons[0].left).toBe(false);
  });

  it('starts a fresh, empty draft each turn', () => {
    const { client } = setup();
    client.queueToken('FORWARD');
    client.lockIn();

    client.acknowledgeTurn();

    expect(client.getView().turn).toBe(2);
    expect(client.getSnapshot().canEdit).toBe(true);
    expect(
      client.getSnapshot().draft.movement.every((slot) => slot === null),
    ).toBe(true);
  });

  it('restores a synced draft after reconnecting mid-turn', () => {
    const { host, bus } = setup();
    host.submitDraft('p1', {
      movement: ['FORWARD', 'TURN_LEFT', null, null],
      cannons: NO_FIRE,
    });

    const reconnected = new GameClient(new LocalTransport(host, bus, 'p1'));

    expect(reconnected.getSnapshot().draft.movement).toEqual([
      'FORWARD',
      'TURN_LEFT',
      null,
      null,
    ]);
  });

  it('passes events through for the presentation layer', () => {
    const { client } = setup();
    const types: string[] = [];
    client.onEvents((event) => types.push(event.type));

    client.lockIn();

    expect(types[0]).toBe('TURN_STARTED');
    expect(types[types.length - 1]).toBe('TURN_ENDED');
    expect(client.getPendingEvents()).not.toBeNull();
  });
});

describe('what a client can see', () => {
  it('only sees the public summary of other players', () => {
    const { host, client } = setup({ humans: 2, ais: 0 });
    host.submitDraft('p2', {
      movement: ['FORWARD', 'FORWARD', null, null],
      cannons: NO_FIRE,
    });

    const view = client.getView();

    expect(view.players.p2.activity).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain('"queue":["FORWARD","FORWARD"');
    expect(view.self.id).toBe('p1');
  });

  it('shows who the turn is waiting on', () => {
    const { host, client } = setup({ humans: 2, ais: 0 });
    client.lockIn();

    expect(client.getView().players.p1.lockedIn).toBe(true);
    expect(client.getView().players.p2.lockedIn).toBe(false);
    expect(host.getState().status).toBe('planning');
  });

  it('turns the host countdown into a local deadline', () => {
    vi.useFakeTimers();
    const { client, host } = setup({ turnDurationMs: 30000 });
    vi.advanceTimersByTime(10000);
    client.queueToken('FORWARD'); // the host echoes a fresh view back

    const remaining = ((client.getSnapshot().deadline ?? 0) - Date.now()) / 1000;
    expect(remaining).toBeCloseTo(20, 0);
    host.dispose();
  });

  it('builds a preview state that includes the unsent draft', () => {
    const { client } = setup();
    client.queueToken('FORWARD');

    expect(client.getPreviewState().players.p1.queue[0]).toBe('FORWARD');
  });
});
