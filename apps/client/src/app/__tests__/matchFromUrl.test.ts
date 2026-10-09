import { describe, expect, it } from 'vitest';
import { matchConfigFromSearch } from '../matchFromUrl';

describe('matchConfigFromSearch', () => {
  it('defaults to the classic duel', () => {
    const config = matchConfigFromSearch('');
    expect(config.participants.map((p) => p.playerId)).toEqual(['player', 'enemy']);
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
