import { describe, expect, it } from 'vitest';
import type { PlayerActions } from '../../domain/TurnResult';
import { emptyCannonQueue } from '../../domain/Action';
import { createGame } from '../createGame';
import { applyPlayerPlan } from '../plans';

const plan = (
  movement: PlayerActions['movement'],
  cannons: PlayerActions['cannons'] = emptyCannonQueue(),
): PlayerActions => ({ movement, cannons });

describe('applyPlayerPlan', () => {
  it('stores a legal plan and spends the movement tokens it uses', () => {
    const state = createGame();

    const result = applyPlayerPlan(
      state,
      'player',
      plan(['FORWARD', 'TURN_LEFT', null, 'FORWARD']),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const player = result.state.players.player;
    expect(player.queue).toEqual(['FORWARD', 'TURN_LEFT', null, 'FORWARD']);
    expect(player.tokens).toEqual({ FORWARD: 1, TURN_LEFT: 1, TURN_RIGHT: 1 });
  });

  it('does not change the input state', () => {
    const state = createGame();
    const before = JSON.stringify(state);

    applyPlayerPlan(state, 'player', plan(['FORWARD', null, null, null]));

    expect(JSON.stringify(state)).toBe(before);
  });

  it('replaces a plan that was already queued, refunding its tokens first', () => {
    const first = applyPlayerPlan(
      createGame(),
      'player',
      plan(['FORWARD', 'FORWARD', 'FORWARD', null]),
    );
    if (!first.ok) throw new Error('setup failed');

    const second = applyPlayerPlan(
      first.state,
      'player',
      plan(['FORWARD', 'FORWARD', 'FORWARD', 'TURN_LEFT']),
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.players.player.tokens).toEqual({
      FORWARD: 0,
      TURN_LEFT: 1,
      TURN_RIGHT: 1,
    });
  });

  it('rejects a plan that needs tokens the player does not hold', () => {
    const result = applyPlayerPlan(
      createGame(),
      'player',
      plan(['TURN_RIGHT', 'TURN_RIGHT', null, null]),
    );

    expect(result).toEqual({ ok: false, reason: 'not_enough_tokens' });
  });

  it('rejects more shots than cannonballs', () => {
    const cannons = emptyCannonQueue().map(() => ({ left: true, right: true }));

    const result = applyPlayerPlan(createGame(), 'player', plan([], cannons));

    expect(result.ok).toBe(false);
  });

  it('rejects malformed plans', () => {
    expect(
      applyPlayerPlan(createGame(), 'player', plan(['FORWARD'])),
    ).toEqual({ ok: false, reason: 'malformed_plan' });
    expect(
      applyPlayerPlan(
        createGame(),
        'player',
        plan(['SPIN' as never, null, null, null]),
      ),
    ).toEqual({ ok: false, reason: 'malformed_plan' });
  });

  it('rejects unknown players, locked-in players and the wrong phase', () => {
    const state = createGame();
    const empty = plan([null, null, null, null]);

    expect(applyPlayerPlan(state, 'ghost', empty)).toEqual({
      ok: false,
      reason: 'unknown_player',
    });
    expect(
      applyPlayerPlan(
        { ...state, players: { ...state.players, player: { ...state.players.player, lockedIn: true } } },
        'player',
        empty,
      ),
    ).toEqual({ ok: false, reason: 'already_locked_in' });
    expect(applyPlayerPlan({ ...state, status: 'animating' }, 'player', empty)).toEqual({
      ok: false,
      reason: 'not_planning',
    });
  });
});
