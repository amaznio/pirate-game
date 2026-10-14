import { describe, expect, it } from 'vitest';
import { parseStoredShip } from '../useStoredShip';

describe('parseStoredShip', () => {
  it('keeps a class a player can sail', () => {
    expect(parseStoredShip('galleon')).toBe('galleon');
    expect(parseStoredShip('brigantine')).toBe('brigantine');
    expect(parseStoredShip('sloop')).toBe('sloop');
  });

  it('falls back to the Sloop for nothing, rubbish or a ship only the game sails', () => {
    expect(parseStoredShip(null)).toBe('sloop');
    expect(parseStoredShip('')).toBe('sloop');
    expect(parseStoredShip('battleship')).toBe('sloop');
    expect(parseStoredShip('merchantman')).toBe('sloop');
    expect(parseStoredShip('raider')).toBe('sloop');
    expect(parseStoredShip('__proto__')).toBe('sloop');
  });
});
