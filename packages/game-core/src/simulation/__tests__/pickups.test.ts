import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { PickupMap } from '../../domain/Pickup';
import { PICKUP_EFFECTS } from '../../config/gameRules';
import { totalTokens } from '../../domain/Action';
import { resolveTurn } from '../resolveTurn';
import { redactState, viewToState } from '../../view/redact';
import { defaultEnemy, defaultPlayer, gameWith, submitted } from './testUtils';

function sea(pickups: PickupMap | undefined, playerHp = 4): GameState {
  const state = gameWith(
    defaultPlayer({ position: { x: 5, y: 10 }, heading: 'EAST', hp: playerHp }),
    defaultEnemy({ position: { x: 15, y: 3 }, heading: 'SOUTH' }),
  );
  return pickups === undefined ? state : { ...state, pickups };
}


describe('pickups', () => {
  it('a barrel adds cannonballs to the ship that ends the phase on it, and is used up', () => {
    const state = sea({ '6,10': { kind: 'barrel' } });
    const result = resolveTurn(state, submitted(['FORWARD', null, null, null]));
    const collected = result.events.find((e) => e.type === 'PICKUP_COLLECTED');
    expect(collected).toMatchObject({
      shipId: 'player-ship',
      kind: 'barrel',
      at: { x: 6, y: 10 },
      gained: PICKUP_EFFECTS.barrel.ammo,
      phase: 0,
    });
    expect(result.nextState.players.player.ammo).toBe(
      state.players.player.ammo + PICKUP_EFFECTS.barrel.ammo,
    );
    expect(result.nextState.pickups).toEqual({});
  });

  it('it is taken in the phase the ship arrives, not before', () => {
    const state = sea({ '7,10': { kind: 'barrel' } });
    const result = resolveTurn(state, submitted(['FORWARD', 'FORWARD', null, null]));
    expect(result.events.find((e) => e.type === 'PICKUP_COLLECTED')).toMatchObject({ phase: 1 });
    expect(result.nextState.pickups).toEqual({});
  });

  it('a plank mends one hull but never past the maximum', () => {
    const hurt = resolveTurn(
      sea({ '6,10': { kind: 'plank' } }, 2),
      submitted(['FORWARD', null, null, null]),
    );
    expect(hurt.nextState.ships['player-ship'].hp).toBe(2 + PICKUP_EFFECTS.plank.hull);

    const whole = resolveTurn(
      sea({ '6,10': { kind: 'plank' } }, 4),
      submitted(['FORWARD', null, null, null]),
    );
    expect(whole.nextState.ships['player-ship'].hp).toBe(4);
    const event = whole.events.find((e) => e.type === 'PICKUP_COLLECTED');
    expect(event).toMatchObject({ kind: 'plank', gained: 0 });
    expect(whole.nextState.pickups).toEqual({});
  });

  it('a crate adds tokens, stopping at the ship cap', () => {
    const base = sea({ '6,10': { kind: 'crate' } });
    const holding = (tokens: { FORWARD: number; TURN_LEFT: number; TURN_RIGHT: number }): GameState => ({
      ...base,
      players: { ...base.players, player: { ...base.players.player, tokens } },
    });
    const play = (state: GameState) => resolveTurn(state, submitted(['FORWARD', null, null, null]));
    const taken = (state: GameState) => state.players.player.tokens;

    // Room to spare: the whole crate fits.
    const roomy = holding({ FORWARD: 2, TURN_LEFT: 1, TURN_RIGHT: 1 });
    expect(totalTokens(taken(play(roomy).nextState))).toBe(4 + PICKUP_EFFECTS.crate.tokens);

    // One short of the sloop's cap of 10: only one token fits, and the crate is still used up.
    const nearlyFull = play(holding({ FORWARD: 5, TURN_LEFT: 2, TURN_RIGHT: 2 }));
    expect(totalTokens(taken(nearlyFull.nextState))).toBe(10);
    expect(nearlyFull.events.find((e) => e.type === 'PICKUP_COLLECTED')).toMatchObject({ gained: 1 });
    expect(nearlyFull.nextState.pickups).toEqual({});

    // Already full: nothing fits.
    const full = play(holding({ FORWARD: 6, TURN_LEFT: 2, TURN_RIGHT: 2 }));
    expect(totalTokens(taken(full.nextState))).toBe(10);
    expect(full.events.find((e) => e.type === 'PICKUP_COLLECTED')).toMatchObject({ gained: 0 });
  });

  it('an enemy ship can collect too, and only the ship on the cell does', () => {
    const state = sea({ '15,4': { kind: 'barrel' }, '6,10': { kind: 'barrel' } });
    const result = resolveTurn(state, submitted([], [], ['FORWARD', null, null, null]));
    const collected = result.events.filter((e) => e.type === 'PICKUP_COLLECTED');
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ shipId: 'enemy-ship' });
    expect(result.nextState.pickups).toEqual({ '6,10': { kind: 'barrel' } });
  });

  it('nothing changes when a match has no pickups', () => {
    const plain = sea(undefined);
    const result = resolveTurn(plain, submitted(['FORWARD', null, null, null]));
    expect('pickups' in result.nextState).toBe(false);
    expect(result.events.some((e) => e.type.startsWith('PICKUP'))).toBe(false);
  });

  it('is deterministic', () => {
    const state = sea({ '6,10': { kind: 'crate' } });
    const plan = submitted(['FORWARD', null, null, null]);
    expect(resolveTurn(state, plan)).toEqual(resolveTurn(state, plan));
  });

  it('every player can see the pickups, and the view carries them back to a state', () => {
    const state = sea({ '6,10': { kind: 'plank' } });
    const view = redactState(state, 'player', null);
    expect(view.pickups).toEqual({ '6,10': { kind: 'plank' } });
    expect(viewToState(view).pickups).toEqual({ '6,10': { kind: 'plank' } });
    expect('pickups' in redactState(sea(undefined), 'player', null)).toBe(false);
  });
});

