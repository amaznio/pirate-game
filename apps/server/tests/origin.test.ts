import { io } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../src/gameServer';
import type { GameServer } from '../src/gameServer';
import { startServer } from './helpers';

describe('isOriginAllowed', () => {
  const allowed = ['https://game.example.com', 'http://localhost:5173'];

  it('lets a request with no Origin header through (not a browser page)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it('allows exactly the configured origins', () => {
    expect(isOriginAllowed('https://game.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
  });

  it('refuses every other website', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('http://game.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://game.example.com.evil.com', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });

  it('tolerates a trailing slash on the request origin', () => {
    expect(isOriginAllowed('https://game.example.com/', allowed)).toBe(true);
  });

  it('allows anything when configured with *', () => {
    expect(isOriginAllowed('https://anything.example.com', ['*'])).toBe(true);
  });
});

describe('websocket origin check', () => {
  let server: GameServer;

  afterEach(async () => {
    await server.close();
  });

  const connect = (origin?: string) =>
    new Promise<'connected' | 'refused'>((resolve) => {
      const socket = io(`http://127.0.0.1:${server.port}`, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: origin ? { Origin: origin } : undefined,
      });
      socket.once('connect', () => {
        socket.disconnect();
        resolve('connected');
      });
      socket.once('connect_error', () => {
        socket.disconnect();
        resolve('refused');
      });
    });

  it('accepts the client site, a script with no Origin, and refuses other sites', async () => {
    server = await startServer({ clientOrigins: ['https://game.example.com'] });

    expect(await connect('https://game.example.com')).toBe('connected');
    expect(await connect()).toBe('connected');
    expect(await connect('https://evil.example.com')).toBe('refused');
  });

  it('accepts any site when the server is set to *', async () => {
    server = await startServer({ clientOrigins: ['*'] });

    expect(await connect('https://anything.example.com')).toBe('connected');
  });
});
