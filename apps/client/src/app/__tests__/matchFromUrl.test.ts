import { describe, expect, it } from 'vitest';
import { matchConfigFromSearch } from '../matchFromUrl';

describe('matchConfigFromSearch', () => {
  it('defaults to the classic duel', () => {
    const config = matchConfigFromSearch('');
    expect(config.participants.map((p) => p.playerId)).toEqual(['player', 'enemy']);
  });

  it('cannot be given a head start through the address', () => {
    const plain = matchConfigFromSearch('?seed=4');
    const cheat = matchConfigFromSearch('?seed=4&hull=1&ammo=99&carryOver=1&bonus=5');
    expect(cheat.carryOver).toBeUndefined();
    expect(cheat).toEqual(plain);
  });

  it('floats pickups only with ?loot=on', () => {
    expect(matchConfigFromSearch('?seed=4').pickups).toBeUndefined();
    expect(Object.keys(matchConfigFromSearch('?seed=4&loot=on').pickups ?? {}).length).toBeGreaterThan(0);
  });

  it('rebuilds the same board from ?seed= and picks a new one otherwise', () => {
    const a = matchConfigFromSearch('?seed=77&map=stormy');
    expect(matchConfigFromSearch('?seed=77&map=stormy')).toEqual(a);
    expect(a.seed).toBe(77);
    expect(a.obstacles.length).toBeGreaterThan(0);

    const seeds = new Set([1, 2, 3, 4, 5].map(() => matchConfigFromSearch('').seed));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('understands ?map= (and open water)', () => {
    const open = matchConfigFromSearch('?map=open&seed=1');
    expect(open.obstacles).toEqual([]);
    expect(open.terrain).toEqual({});
    const calm = matchConfigFromSearch('?map=calm&seed=1&ais=2');
    const stormy = matchConfigFromSearch('?map=stormy&seed=1&ais=2');
    expect(Object.keys(calm.terrain ?? {}).length).toBeLessThan(
      Object.keys(stormy.terrain ?? {}).length,
    );
  });

  it('builds a free-for-all with the requested number of AIs', () => {
    const config = matchConfigFromSearch('?ais=3');
    expect(config.participants).toHaveLength(4);
    expect(new Set(config.participants.map((p) => p.teamId)).size).toBe(4);
  });

  it('supports teams and board size', () => {
    const config = matchConfigFromSearch('?ais=3&teams=teams&w=30&h=26');
    expect(new Set(config.participants.map((p) => p.teamId))).toEqual(
      new Set(['team-a', 'team-b']),
    );
    expect(config.board).toEqual({ width: 30, height: 26 });
  });

  it('caps the number of ships and falls back when the board is too small', () => {
    expect(matchConfigFromSearch('?ais=99').participants.length).toBeLessThanOrEqual(16);
    expect(matchConfigFromSearch('?ais=3&w=4&h=4').participants).toHaveLength(2);
  });
});

describe('AI difficulty from the URL', () => {
  const levels = (search: string) =>
    matchConfigFromSearch(search).participants.map((participant) => participant.aiDifficulty);

  it('is normal unless asked for', () => {
    expect(levels('')).toEqual(['normal', 'normal']);
    expect(levels('?ais=2')).toEqual(['normal', 'normal', 'normal']);
  });

  it('can be set for a skirmish and for the duel', () => {
    expect(levels('?ais=2&difficulty=hard')).toEqual(['hard', 'hard', 'hard']);
    expect(levels('?difficulty=easy')).toEqual(['easy', 'easy']);
  });

  it('ignores a level that does not exist', () => {
    expect(levels('?ais=1&difficulty=impossible')).toEqual(['normal', 'normal']);
  });

  it('survives falling back to the duel when the board is too small', () => {
    expect(levels('?ais=3&w=4&h=4&difficulty=hard')).toEqual(['hard', 'hard']);
  });
});

describe('ship classes in the URL', () => {
  const ships = (search: string) =>
    matchConfigFromSearch(search).participants.map((p) => p.shipTypeId);

  it('sails sloops unless asked', () => {
    expect(ships('')).toEqual(['sloop', 'sloop']);
    expect(ships('?ais=2')).toEqual(['sloop', 'sloop', 'sloop']);
  });

  it('gives you ?ship= and the others the same unless ?enemy= says otherwise', () => {
    expect(ships('?ship=galleon')).toEqual(['galleon', 'galleon']);
    expect(ships('?ship=galleon&enemy=sloop')).toEqual(['galleon', 'sloop']);
    expect(ships('?ais=3&ship=brigantine&enemy=sloop')).toEqual([
      'brigantine',
      'sloop',
      'sloop',
      'sloop',
    ]);
  });

  it('ignores a class that does not exist', () => {
    expect(ships('?ship=raft&enemy=submarine')).toEqual(['sloop', 'sloop']);
  });
});
