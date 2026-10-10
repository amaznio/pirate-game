import { describe, expect, it } from 'vitest';
import {
  parseName,
  parseOpaqueId,
  parsePlayerActions,
  parseJoinCode,
  parsePublicRoomList,
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
      parseRoomOptions({
        ais: 3,
        aiDifficulty: 'easy',
        teamMode: 'teams',
        turnDurationSeconds: 45,
      }),
    ).toEqual({
      ais: 3,
      aiDifficulty: 'easy',
      teamMode: 'teams',
      turnDurationSeconds: 45,
      visibility: 'private',
      mapStyle: 'normal',
    });
    expect(
      parseRoomOptions(
        { ais: 0 },
        {
          ais: 5,
          aiDifficulty: 'hard',
          teamMode: 'teams',
          turnDurationSeconds: 20,
          visibility: 'public',
          mapStyle: 'calm',
        },
      ),
    ).toEqual({
      ais: 0,
      aiDifficulty: 'hard',
      teamMode: 'teams',
      turnDurationSeconds: 20,
      visibility: 'public',
      mapStyle: 'calm',
    });
    expect(parseRoomOptions({ mapStyle: 'stormy' })?.mapStyle).toBe('stormy');
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
    { aiDifficulty: 'impossible' },
    { visibility: 'secret' },
    { mapStyle: 'tsunami' },
    { mapStyle: 3 },
    { visibility: true },
    { aiDifficulty: 3 },
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

describe('visibility', () => {
  it('defaults to private, so a room is never listed by accident', () => {
    expect(DEFAULT_ROOM_OPTIONS.visibility).toBe('private');
    expect(parseRoomOptions({})?.visibility).toBe('private');
  });

  it('can be made public or private', () => {
    expect(parseRoomOptions({ visibility: 'public' })?.visibility).toBe('public');
    expect(
      parseRoomOptions({ visibility: 'private' }, { ...DEFAULT_ROOM_OPTIONS, visibility: 'public' })
        ?.visibility,
    ).toBe('private');
  });
});

describe('parseJoinCode', () => {
  it('accepts a short code or a long key, in any case', () => {
    expect(parseJoinCode(' ab3d9 ')).toBe('AB3D9');
    expect(parseJoinCode('k7x9q2mp')).toBe('K7X9Q2MP');
  });

  it('rejects anything that could not be a code', () => {
    expect(parseJoinCode('ab')).toBeNull();
    expect(parseJoinCode('a'.repeat(13))).toBeNull();
    expect(parseJoinCode('ab cd')).toBeNull();
    expect(parseJoinCode('ab-cd')).toBeNull();
    expect(parseJoinCode(null)).toBeNull();
    expect(parseJoinCode(12345)).toBeNull();
  });
});

describe('parsePublicRoomList', () => {
  const room = {
    code: 'ABCDE',
    hostName: 'Anne',
    players: 1,
    maxPlayers: 8,
    ais: 2,
    aiDifficulty: 'hard',
    teamMode: 'ffa',
    turnDurationSeconds: 30,
  };

  it('accepts a well-formed list', () => {
    expect(parsePublicRoomList({ rooms: [room, { ...room, code: 'FGHJK', turnDurationSeconds: null }] })).toEqual([
      room,
      { ...room, code: 'FGHJK', turnDurationSeconds: null },
    ]);
  });

  it('is empty for anything that is not a list of rooms', () => {
    for (const value of [null, undefined, 'rooms', 5, [], {}, { rooms: 'x' }, { rooms: null }]) {
      expect(parsePublicRoomList(value)).toEqual([]);
    }
  });

  it('leaves out an entry with anything wrong, and keeps the rest', () => {
    const broken = [
      { ...room, code: 'no spaces' },
      { ...room, code: 5 },
      { ...room, hostName: '   ' },
      { ...room, players: -1 },
      { ...room, players: 99 },
      { ...room, maxPlayers: 1.5 },
      { ...room, ais: '2' },
      { ...room, aiDifficulty: 'impossible' },
      { ...room, teamMode: 'chaos' },
      { ...room, turnDurationSeconds: 0 },
      { ...room, turnDurationSeconds: 'soon' },
      null,
      'room',
    ];

    expect(parsePublicRoomList({ rooms: [...broken, room] })).toEqual([room]);
  });

  it('drops any extra fields, so nothing unexpected reaches the page', () => {
    const [clean] = parsePublicRoomList({ rooms: [{ ...room, secret: 'x', key: 'KEYKEYKE' }] });

    expect(Object.keys(clean).sort()).toEqual(Object.keys(room).sort());
  });

  it('cleans up a host name and normalises the code', () => {
    const [clean] = parsePublicRoomList({
      rooms: [{ ...room, code: 'abcde', hostName: '  An\u0000ne  ' }],
    });

    expect(clean.code).toBe('ABCDE');
    expect(clean.hostName).toBe('Anne');
  });

  it('never returns more than the limit', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ ...room, code: `R${index + 100}` }));

    expect(parsePublicRoomList({ rooms: many })).toHaveLength(50);
    expect(parsePublicRoomList({ rooms: many }, 10)).toHaveLength(10);
  });
});
