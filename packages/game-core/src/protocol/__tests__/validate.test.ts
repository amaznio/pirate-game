import { describe, expect, it } from 'vitest';
import {
  parseName,
  parseOpaqueId,
  parsePlayerActions,
  parseRoomId,
  parseRoomOptions,
  parseTokenPatch,
} from '../validate';
import { DEFAULT_ROOM_OPTIONS } from '../messages';

const noFire = Array.from({ length: 4 }, () => ({ left: false, right: false }));

describe('parsePlayerActions', () => {
  it('accepts a well-formed plan and returns a clean copy', () => {
    const input = {
      movement: ['FORWARD', null, 'TURN_LEFT', null],
      cannons: noFire,
      extra: 'ignored',
    };

    const plan = parsePlayerActions(input);

    expect(plan).toEqual({
      movement: ['FORWARD', null, 'TURN_LEFT', null],
      cannons: noFire,
    });
    expect(plan).not.toBe(input);
    expect(plan).not.toHaveProperty('extra');
  });

  it.each([
    ['null', null],
    ['a string', 'plan'],
    ['an array', []],
    ['missing cannons', { movement: [null, null, null, null] }],
    ['too few slots', { movement: [null], cannons: noFire }],
    ['too many slots', { movement: [null, null, null, null, null], cannons: noFire }],
    ['an unknown action', { movement: ['SPIN', null, null, null], cannons: noFire }],
    ['a non-string action', { movement: [1, null, null, null], cannons: noFire }],
    [
      'a non-boolean cannon flag',
      {
        movement: [null, null, null, null],
        cannons: [{ left: 1, right: false }, ...noFire.slice(1)],
      },
    ],
    [
      'a missing cannon flag',
      { movement: [null, null, null, null], cannons: [{}, ...noFire.slice(1)] },
    ],
  ])('rejects %s', (_label, input) => {
    expect(parsePlayerActions(input)).toBeNull();
  });
});

describe('parseTokenPatch', () => {
  it('accepts auto and requested, alone or together', () => {
    expect(parseTokenPatch({ auto: false })).toEqual({ auto: false });
    expect(parseTokenPatch({ requested: 'TURN_LEFT' })).toEqual({
      requested: 'TURN_LEFT',
    });
    expect(parseTokenPatch({ auto: true, requested: 'FORWARD', evil: 1 })).toEqual({
      auto: true,
      requested: 'FORWARD',
    });
  });

  it('rejects bad values', () => {
    expect(parseTokenPatch({ auto: 'yes' })).toBeNull();
    expect(parseTokenPatch({ requested: 'SPIN' })).toBeNull();
    expect(parseTokenPatch(null)).toBeNull();
  });
});

describe('parseName', () => {
  it('trims, strips control characters and caps the length', () => {
    expect(parseName('  Anne  ')).toBe('Anne');
    expect(parseName('A\u0000n\nne')).toBe('Anne');
    expect(parseName('x'.repeat(50))).toHaveLength(20);
  });

  it('rejects empty and non-string names', () => {
    expect(parseName('   ')).toBeNull();
    expect(parseName('\u0001\u0002')).toBeNull();
    expect(parseName(42)).toBeNull();
  });
});

describe('parseRoomId and parseOpaqueId', () => {
  it('normalises room codes', () => {
    expect(parseRoomId(' ab3d9 ')).toBe('AB3D9');
    expect(parseRoomId('no spaces')).toBeNull();
    expect(parseRoomId('x')).toBeNull();
    expect(parseRoomId(5)).toBeNull();
  });

  it('accepts plain ids and rejects odd ones', () => {
    expect(parseOpaqueId('seat_abc-123')).toBe('seat_abc-123');
    expect(parseOpaqueId('a b')).toBeNull();
    expect(parseOpaqueId('abc')).toBeNull();
    expect(parseOpaqueId('x'.repeat(100))).toBeNull();
  });
});

describe('parseRoomOptions', () => {
  it('uses the defaults when nothing is given', () => {
    expect(parseRoomOptions(undefined)).toEqual(DEFAULT_ROOM_OPTIONS);
    expect(parseRoomOptions({})).toEqual(DEFAULT_ROOM_OPTIONS);
  });

  it('applies valid changes on top of the base', () => {
    expect(
      parseRoomOptions({ ais: 3, teamMode: 'teams', turnDurationSeconds: 45 }),
    ).toEqual({ ais: 3, teamMode: 'teams', turnDurationSeconds: 45 });
    expect(parseRoomOptions({ ais: 0 }, { ais: 5, teamMode: 'teams', turnDurationSeconds: 20 })).toEqual({
      ais: 0,
      teamMode: 'teams',
      turnDurationSeconds: 20,
    });
  });

  it('allows turning the timer off', () => {
    expect(parseRoomOptions({ turnDurationSeconds: null })?.turnDurationSeconds).toBeNull();
  });

  it.each([
    { ais: -1 },
    { ais: 99 },
    { ais: 1.5 },
    { ais: '2' },
    { teamMode: 'chaos' },
    { turnDurationSeconds: 2 },
    { turnDurationSeconds: 9999 },
    { turnDurationSeconds: 'fast' },
  ])('rejects %j', (input) => {
    expect(parseRoomOptions(input)).toBeNull();
  });

  it('rejects options that are not an object', () => {
    expect(parseRoomOptions('ais=3')).toBeNull();
  });
});
