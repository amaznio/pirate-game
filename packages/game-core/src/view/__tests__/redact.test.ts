import { describe, expect, it } from 'vitest';
import { createGame } from '../../simulation/createGame';
import { createSkirmishConfig } from '../../config/matchConfig';
import { resolveTurn } from '../../simulation/resolveTurn';
import type { GameState } from '../../domain/GameState';
import { planActivity, redactState, viewToState } from '../redact';

/** p2 has a distinctive private plan, tokens and ammo that p1 must never see. */
function stateWithSecrets(): GameState {
  const base = createGame(
    createSkirmishConfig({ humans: 2, ais: 1, teamMode: 'ffa' }),
  );
  return {
    ...base,
    players: {
      ...base.players,
      p2: {
        ...base.players.p2,
        queue: ['TURN_RIGHT', 'TURN_RIGHT', 'FORWARD', null],
        cannonQueue: [
          { left: true, right: false },
          { left: false, right: false },
          { left: false, right: true },
          { left: false, right: false },
        ],
        tokens: { FORWARD: 7, TURN_LEFT: 8, TURN_RIGHT: 9 },
        ammo: 42,
        tokenGeneration: { auto: false, requested: 'TURN_LEFT', rotationIndex: 5 },
      },
    },
  };
}

describe('redactState', () => {
  it('gives a player their own plan and resources', () => {
    const view = redactState(stateWithSecrets(), 'p2', 12);

    expect(view.viewerId).toBe('p2');
    expect(view.self.queue).toEqual(['TURN_RIGHT', 'TURN_RIGHT', 'FORWARD', null]);
    expect(view.self.ammo).toBe(42);
    expect(view.self.tokens).toEqual({ FORWARD: 7, TURN_LEFT: 8, TURN_RIGHT: 9 });
    expect(view.planningSecondsRemaining).toBe(12);
  });

  it('never reveals another player plan, tokens, ammo or settings', () => {
    const view = redactState(stateWithSecrets(), 'p1', null);
    const wire = JSON.stringify(view);

    expect(wire).not.toContain('"ammo":42');
    expect(wire).not.toContain('"FORWARD":7');
    expect(wire).not.toContain('"rotationIndex":5');
    expect(wire).not.toContain('"requested":"TURN_LEFT"');

    // The only place p2 appears is as a public summary.
    expect(Object.keys(view.players.p2).sort()).toEqual([
      'activity',
      'controller',
      'id',
      'lockedIn',
      'name',
      'shipId',
      'teamId',
    ]);
    expect(view.self.id).toBe('p1');
  });

  it('leaks no movement action from another player anywhere in the view', () => {
    const view = redactState(stateWithSecrets(), 'p1', null);
    const wire = JSON.stringify(view);

    // p1 has planned nothing, so no queued action name may appear on the wire.
    expect(view.self.queue.every((slot) => slot === null)).toBe(true);
    expect(wire).not.toContain('["TURN_RIGHT"');
    expect(wire).not.toContain('"queue":["FORWARD"');
  });

  it('keeps board information public: ships, hulls and obstacles', () => {
    const state = stateWithSecrets();
    const view = redactState(state, 'p1', null);

    expect(view.ships).toBe(state.ships);
    expect(view.obstacles).toBe(state.obstacles);
    expect(view.board).toBe(state.board);
  });

  it('shows how busy another plan is, but not what it holds', () => {
    const view = redactState(stateWithSecrets(), 'p1', null);

    expect(view.players.p2.activity).toBeGreaterThan(0);
    expect(view.players.p1.activity).toBe(0);
  });

  it('rejects an unknown viewer', () => {
    expect(() => redactState(createGame(), 'ghost', null)).toThrow();
  });
});

describe('planActivity', () => {
  it('is 0 for an empty plan and 1 for a full one', () => {
    const full = {
      movement: ['FORWARD', 'FORWARD', 'FORWARD', 'FORWARD'] as const,
      cannons: Array.from({ length: 4 }, () => ({ left: true, right: false })),
    };
    expect(planActivity({ movement: [null, null, null, null], cannons: [] })).toBe(0);
    expect(planActivity(full)).toBe(1);
  });

  it('grows with the amount planned and ignores which action it is', () => {
    const turns = planActivity({
      movement: ['TURN_LEFT', 'TURN_RIGHT', null, null],
      cannons: [],
    });
    const forwards = planActivity({
      movement: ['FORWARD', 'FORWARD', null, null],
      cannons: [],
    });
    const more = planActivity({
      movement: ['FORWARD', 'FORWARD', 'FORWARD', null],
      cannons: [],
    });

    expect(turns).toBe(forwards);
    expect(more).toBeGreaterThan(forwards);
  });
});

describe('viewToState', () => {
  it('rebuilds a state the shared simulation can run, with others standing still', () => {
    const state = stateWithSecrets();
    const view = redactState(state, 'p1', null);

    const rebuilt = viewToState(view, {
      movement: ['FORWARD', null, null, null],
      cannons: view.self.cannonQueue,
    });
    const result = resolveTurn(rebuilt, {
      p1: {
        movement: rebuilt.players.p1.queue,
        cannons: rebuilt.players.p1.cannonQueue,
      },
    });

    expect(result.nextState.ships['p1-ship'].position).not.toEqual(
      state.ships['p1-ship'].position,
    );
    expect(result.nextState.ships['p2-ship'].position).toEqual(
      state.ships['p2-ship'].position,
    );
  });

  it('gives other players empty placeholder plans and resources', () => {
    const rebuilt = viewToState(redactState(stateWithSecrets(), 'p1', null));

    expect(rebuilt.players.p2.ammo).toBe(0);
    expect(rebuilt.players.p2.queue.every((slot) => slot === null)).toBe(true);
  });
});
