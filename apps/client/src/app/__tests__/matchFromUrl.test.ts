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
