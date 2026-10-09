import { describe, expect, it } from 'vitest';
import { checkServerUrl } from '../serverUrlCheck';

describe('checkServerUrl', () => {
  it('accepts a normal https server address', () => {
    expect(checkServerUrl('https://game.up.railway.app', true)).toEqual({
      level: 'ok',
      message: null,
    });
    expect(checkServerUrl('https://game.up.railway.app/', true).level).toBe('ok');
  });

  it('is fine with nothing set during development', () => {
    expect(checkServerUrl(undefined, false).level).toBe('ok');
    expect(checkServerUrl('   ', false).level).toBe('ok');
  });

  it('warns that a production build without it has no online play', () => {
    const check = checkServerUrl(undefined, true);

    expect(check.level).toBe('warn');
    expect(check.message).toMatch(/no online play/);
  });

  it('refuses a domain without a scheme, and suggests the fix', () => {
    const check = checkServerUrl('game.up.railway.app', true);

    expect(check.level).toBe('error');
    expect(check.message).toContain('https://game.up.railway.app');
  });

  it('refuses a host:port that parses as a scheme', () => {
    expect(checkServerUrl('localhost:3001', false).level).toBe('error');
  });

  it('refuses other schemes', () => {
    expect(checkServerUrl('ftp://game.example.com', true).level).toBe('error');
  });

  it('refuses a path, query or fragment (a path would become a Socket.IO namespace)', () => {
    expect(checkServerUrl('https://game.example.com/socket', true).level).toBe('error');
    expect(checkServerUrl('https://game.example.com/?x=1', true).level).toBe('error');
    expect(checkServerUrl('https://game.example.com/#top', true).level).toBe('error');
  });

  it('warns about plain http for a hosted server, but not for localhost', () => {
    expect(checkServerUrl('http://game.example.com', true).level).toBe('warn');
    expect(checkServerUrl('http://localhost:3001', true).level).toBe('ok');
    expect(checkServerUrl('http://game.example.com', false).level).toBe('ok');
  });
});
