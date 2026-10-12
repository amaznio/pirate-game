import { describe, expect, it } from 'vitest';
import { englishT, tFor } from '../testing';
import { humanMessage } from '../humanMessage';
import { aiLevelBlurb, aiLevelLabel } from '../../ui/menu/aiLevels';
import { shareCodeLabel } from '../../ui/menu/visibility';

describe('translation', () => {
  const t = englishT();

  it('interpolates values into a message', () => {
    expect(t('lobby.startMatch', { count: 3 })).toBe('Start match (3 ships)');
    expect(t('ship.hull', { hp: 5 })).toBe('Hull 5.');
  });

  it('picks the plural form from the count', () => {
    expect(t('lobby.startMatch', { count: 1 })).toBe('Start match (1 ship)');
    expect(t('lobby.players', { count: 2 })).toBe('Players (2)');
  });

  it('uses all four Polish plural forms', () => {
    const pl = tFor('pl');
    expect(pl('lobby.startMatch', { count: 1 })).toBe('Start meczu (1 statek)');
    expect(pl('lobby.startMatch', { count: 3 })).toBe('Start meczu (3 statki)');
    expect(pl('lobby.startMatch', { count: 5 })).toBe('Start meczu (5 statków)');
    expect(pl('hud.waitingFor', { count: 3 })).toBe(
      'Zablokowano — czekam na 3 innych graczy',
    );
  });

  it('reads labels through the typed helpers', () => {
    expect(aiLevelLabel(t, 'hard')).toBe('Hard');
    expect(aiLevelBlurb(t, 'easy')).toMatch(/voyage/i);
    expect(shareCodeLabel(t, 'private')).toBe('Room key');
    expect(shareCodeLabel(t, 'public')).toBe('Room code');
  });

  it('turns a server code into a translated message', () => {
    expect(humanMessage(t, { code: 'room_full', text: 'x' })).toBe('That room is full.');
    expect(humanMessage(t, { code: 'other_window', text: 'x' })).toBe(
      'Opened in another window.',
    );
  });

  it('falls back to the server text for an unknown code', () => {
    expect(humanMessage(t, { code: 'brand_new', text: 'A fresh server message.' })).toBe(
      'A fresh server message.',
    );
    expect(humanMessage(t, null)).toBeNull();
  });
});
