import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from '../serverUrl';

const page = { protocol: 'http:', hostname: 'localhost' };

describe('resolveServerUrl', () => {
  it('uses the configured server and drops a trailing slash', () => {
    expect(
      resolveServerUrl({ VITE_SERVER_URL: ' https://game.example.com// ' }, page),
    ).toBe('https://game.example.com');
  });

  it('prefers the configured server even in development', () => {
    expect(
      resolveServerUrl({ VITE_SERVER_URL: 'https://game.example.com', DEV: true }, page),
    ).toBe('https://game.example.com');
  });

  it('uses the local server in development, on the same host as the page', () => {
    expect(resolveServerUrl({ DEV: true }, page)).toBe('http://localhost:3001');
    expect(
      resolveServerUrl({ DEV: true }, { protocol: 'http:', hostname: '192.168.1.5' }),
    ).toBe('http://192.168.1.5:3001');
  });

  it('has no server in production unless one is configured', () => {
    expect(resolveServerUrl({ DEV: false }, page)).toBeNull();
    expect(resolveServerUrl({ VITE_SERVER_URL: '   ' }, page)).toBeNull();
  });
});
