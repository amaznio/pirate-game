import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('has sensible defaults for local development', () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      host: '0.0.0.0',
      clientOrigins: ['http://localhost:5173'],
      maxRooms: 100,
      idleRoomMs: 10 * 60_000,
      awayGraceMs: 15_000,
    });
  });

  it('reads the port Railway provides', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it('accepts several client origins and tidies them', () => {
    const config = loadConfig({
      CLIENT_ORIGIN: ' https://game.example.com/ , http://localhost:5173 ,, ',
    });

    expect(config.clientOrigins).toEqual([
      'https://game.example.com',
      'http://localhost:5173',
    ]);
  });

  it('ignores numbers it cannot use', () => {
    const config = loadConfig({ PORT: 'abc', MAX_ROOMS: '-4', IDLE_ROOM_MINUTES: '0' });

    expect(config.port).toBe(3001);
    expect(config.maxRooms).toBe(100);
    expect(config.idleRoomMs).toBe(10 * 60_000);
  });

  it('reads how long a player may be away before an AI takes over', () => {
    expect(loadConfig({ AWAY_GRACE_SECONDS: '40' }).awayGraceMs).toBe(40_000);
    expect(loadConfig({ AWAY_GRACE_SECONDS: 'soon' }).awayGraceMs).toBe(15_000);
  });

  it('converts the idle time from minutes', () => {
    expect(loadConfig({ IDLE_ROOM_MINUTES: '2' }).idleRoomMs).toBe(120_000);
  });
});
