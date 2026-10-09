import { describe, expect, it } from 'vitest';
import { pos } from '../../domain/Position';
import type { GameEvent } from '../../domain/GameEvent';
import { CANNON_STARTING_AMMO } from '../../config/gameRules';
import { resolveTurn } from '../resolveTurn';
import {
  cannon,
  defaultEnemy,
  defaultPlayer,
  gameWith,
  rock,
  submitted,
  withAmmo,
} from './testUtils';

function eventsOfType<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event) => event.type === type) as Extract<
    GameEvent,
    { type: T }
  >[];
}

describe('cannon shots are explicit queued actions', () => {
  it('does not fire when no cannon is queued', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted());

    expect(eventsOfType(result.events, 'CANNON_FIRED')).toHaveLength(0);
    expect(result.nextState.ships['enemy-ship'].hp).toBe(4);
  });

  it('fires in the phase where the cannon move is queued', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(
      state,
      submitted([], [cannon(false, false), cannon(false, false), cannon(true, false)]),
    );

    const fired = eventsOfType(result.events, 'CANNON_FIRED');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ side: 'left', phase: 2 });
  });
});

describe('broadside cannon range', () => {
  it('hits a target three cells away (range 3)', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    const hits = eventsOfType(result.events, 'PROJECTILE_HIT');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      shipId: 'player-ship',
      side: 'left',
      targetId: 'enemy-ship',
      damage: 1,
    });
  });

  it('misses a target four cells away', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(6, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(eventsOfType(result.events, 'PROJECTILE_HIT')).toHaveLength(0);
    const misses = eventsOfType(result.events, 'PROJECTILE_MISSED');
    expect(misses.some((event) => event.side === 'left')).toBe(true);
  });
});

describe('first blocking entity stops the shot', () => {
  it('hits an obstacle before the ship behind it', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy, [rock('rock-mid', 8, 10)]);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    const hits = eventsOfType(result.events, 'PROJECTILE_HIT');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      targetId: 'rock-mid',
      targetKind: 'rock',
      damage: 0,
    });
    expect(result.nextState.ships['enemy-ship'].hp).toBe(4);
  });
});

describe('damage and destruction', () => {
  it('reduces hull HP on a hit', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(result.nextState.ships['enemy-ship'].hp).toBe(3);
    const damaged = eventsOfType(result.events, 'SHIP_DAMAGED');
    expect(damaged).toHaveLength(1);
    expect(damaged[0]).toMatchObject({ shipId: 'enemy-ship', amount: 1, hp: 3 });
  });

  it('destroys a ship at zero HP and ends the game', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({
      position: pos(7, 10),
      heading: 'SOUTH',
      hp: 1,
    });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(eventsOfType(result.events, 'SHIP_DESTROYED')).toHaveLength(1);
    const ended = eventsOfType(result.events, 'GAME_ENDED');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      outcome: { kind: 'win', teamId: 'player' },
    });
    expect(result.nextState.status).toBe('game_over');
    expect(result.nextState.outcome).toEqual({
      kind: 'win',
      teamId: 'player',
    });
  });
});

describe('cannonball resource', () => {
  it('spends one cannonball per broadside fired', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(10, 1), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const result = resolveTurn(state, submitted([], [cannon(true, true)]));

    expect(result.nextState.players.player.ammo).toBe(
      CANNON_STARTING_AMMO - 2,
    );
  });

  it('blocks a shot when the pool is empty', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(7, 10), heading: 'SOUTH' });
    const state = withAmmo(gameWith(player, enemy), 'player', 0);

    const result = resolveTurn(state, submitted([], [cannon(true, false)]));

    expect(eventsOfType(result.events, 'CANNON_FIRED')).toHaveLength(0);
    expect(eventsOfType(result.events, 'CANNON_BLOCKED')).toHaveLength(1);
    expect(eventsOfType(result.events, 'CANNON_BLOCKED')[0]).toMatchObject({
      shipId: 'player-ship',
      side: 'left',
      reason: 'out_of_ammo',
    });
  });
});
