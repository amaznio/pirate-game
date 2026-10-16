import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import { CARRY_MAX_RELOAD, reloadBonus } from '../../domain/CarryOver';
import { EMPTY_PICKUP_TALLY } from '../../domain/MatchResult';
import { createDuelConfig } from '../../config/matchConfig';
import { createGame } from '../createGame';
import { buildMatchResult } from '../matchResult';
import { resolveTurn } from '../resolveTurn';
import { beginNextTurn } from '../tokens';
import { redactState } from '../../view/redact';
import { totalTokens } from '../../domain/Action';
import { defaultEnemy, defaultPlayer, gameWith, submitted } from './testUtils';

describe('buildMatchResult', () => {
  it('is null while the match is undecided', () => {
    expect(buildMatchResult(createGame())).toBeNull();
  });

  it('says how the match ended and where every ship stands', () => {
    const base = createGame();
    const state: GameState = {
      ...base,
      turn: 6,
      outcome: { kind: 'win', teamId: 'player' },
      ships: {
        ...base.ships,
        'enemy-ship': { ...base.ships['enemy-ship'], hp: 0 },
        'player-ship': { ...base.ships['player-ship'], hp: 2 },
      },
    };
    const result = buildMatchResult(state);
    expect(result).toMatchObject({ outcome: { kind: 'win', teamId: 'player' }, turns: 6 });
    expect(result?.ships.map((s) => s.playerId)).toEqual(['player', 'enemy']);
    expect(result?.ships[0]).toMatchObject({
      hull: 2,
      maxHull: 4,
      afloat: true,
      ammo: state.players.player.ammo,
      tokens: totalTokens(state.players.player.tokens),
      pickups: EMPTY_PICKUP_TALLY,
    });
    expect(result?.ships[1]).toMatchObject({ hull: 0, afloat: false });
  });

  it('counts the pickups each ship took', () => {
    const state = {
      ...gameWith(
        defaultPlayer({ position: { x: 5, y: 10 }, heading: 'EAST' }),
        defaultEnemy({ position: { x: 15, y: 3 }, heading: 'SOUTH' }),
      ),
      pickups: { '6,10': { kind: 'barrel' as const }, '7,10': { kind: 'barrel' as const } },
    };
    const next = resolveTurn(state, submitted(['FORWARD', 'FORWARD', null, null])).nextState;
    expect(next.pickupsTaken).toEqual({ player: { barrel: 2, crate: 0, plank: 0 } });
    const done = { ...next, outcome: { kind: 'draw' as const } };
    expect(buildMatchResult(done)?.ships[0].pickups.barrel).toBe(2);
    expect(buildMatchResult(done)?.ships[1].pickups).toEqual(EMPTY_PICKUP_TALLY);
  });

  it('leaves the state alone when nothing is taken', () => {
    const next = resolveTurn(createGame(), submitted()).nextState;
    expect('pickupsTaken' in next).toBe(false);
  });

  it('reaches players in the view only once the match is over', () => {
    const base = createGame();
    expect(redactState(base, 'player', null).result).toBeUndefined();
    const decided = { ...base, outcome: { kind: 'draw' as const } };
    expect(redactState(decided, 'player', null).result).toBeUndefined();
    const over = { ...decided, status: 'game_over' as const };
    expect(redactState(over, 'player', null).result?.outcome).toEqual({ kind: 'draw' });
    expect('result' in redactState(base, 'player', null)).toBe(false);
  });
});

describe('carry-over', () => {
  const base = createDuelConfig({ sea: 'open', shipTypeIds: ['brigantine', 'sloop'] });

  it('changes nothing when absent', () => {
    expect(createGame(base)).toEqual(createGame({ ...base, carryOver: undefined }));
  });

  it('starts a ship with the hull and ammo it brings, within limits', () => {
    const state = createGame({
      ...base,
      carryOver: { player: { hull: 2, ammo: 9 }, enemy: { hull: 99, ammo: -4 } },
    });
    expect(state.ships['player-ship'].hp).toBe(2);
    expect(state.players.player.ammo).toBe(9);
    expect(state.ships['enemy-ship'].hp).toBe(state.ships['enemy-ship'].maxHp);
    expect(state.players.enemy.ammo).toBe(0);
    expect(createGame({ ...base, carryOver: { player: { hull: 0 } } }).ships['player-ship'].hp).toBe(1);
  });

  it('never carries tokens', () => {
    const plain = createGame(base);
    const carried = createGame({ ...base, carryOver: { player: { hull: 1, ammo: 1 } } });
    expect(carried.players.player.tokens).toEqual(plain.players.player.tokens);
  });

  it('brings a reload modifier in as extra cannonballs each turn, held to the limit', () => {
    const config = {
      ...createDuelConfig({ sea: 'open' }),
      carryOver: { player: { modifiers: [{ kind: 'reload' as const, bonus: 2 }] } },
    };
    const start = createGame(config);
    expect(start.ships['player-ship'].bonusReload).toBe(2);
    expect('bonusReload' in start.ships['enemy-ship']).toBe(false);
    const gained = (state: typeof start, id: string) => beginNextTurn(state).state.players[id].ammo - state.players[id].ammo;
    expect(gained(start, 'player')).toBe(1 + 2);
    expect(gained(start, 'enemy')).toBe(1);

    const tooMany = createGame({
      ...createDuelConfig({ sea: 'open' }),
      carryOver: { player: { modifiers: [{ kind: 'reload' as const, bonus: 99 }] } },
    });
    expect(tooMany.ships['player-ship'].bonusReload).toBe(CARRY_MAX_RELOAD);
    expect(reloadBonus(undefined)).toBe(0);
    expect(reloadBonus([{ kind: 'cannonDamage', bonus: 2 }])).toBe(0);
  });

  it('adds a cannon damage modifier to every shot', () => {
    const config = {
      ...createDuelConfig({ sea: 'open' }),
      carryOver: { player: { modifiers: [{ kind: 'cannonDamage' as const, bonus: 1 }] } },
    };
    const start = createGame(config);
    expect(start.ships['player-ship'].bonusDamage).toBe(1);
    expect('bonusDamage' in start.ships['enemy-ship']).toBe(false);

    const state = gameWith(
      { ...start.ships['player-ship'], position: { x: 10, y: 10 }, heading: 'NORTH' },
      { ...defaultEnemy({ position: { x: 7, y: 10 }, heading: 'SOUTH' }), hp: 4 },
    );
    const result = resolveTurn(state, submitted([], [{ left: 1, right: 0 }, ...[]]));
    const hit = result.events.find((e) => e.type === 'PROJECTILE_HIT');
    expect(hit).toMatchObject({ damage: 2 });
    expect(result.nextState.ships['enemy-ship'].hp).toBe(2);
  });
});
