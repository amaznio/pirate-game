import { describe, expect, it } from 'vitest';
import { configWarnings, isHosted, loadConfig } from './config';

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

describe('isHosted', () => {
  it('recognises production and Railway', () => {
    expect(isHosted({ NODE_ENV: 'production' })).toBe(true);
    expect(isHosted({ RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
    expect(isHosted({})).toBe(false);
    expect(isHosted({ NODE_ENV: 'development' })).toBe(false);
  });
});

describe('configWarnings', () => {
  const check = (env: NodeJS.ProcessEnv) => configWarnings(loadConfig(env), env);

  it('is quiet for local development defaults', () => {
    expect(check({})).toEqual([]);
  });

  it('is quiet for a correct hosted setup', () => {
    expect(
      check({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://game.example.com' }),
    ).toEqual([]);
  });

  it('warns when a hosted server forgot CLIENT_ORIGIN', () => {
    const warnings = check({ RAILWAY_ENVIRONMENT: 'production' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/CLIENT_ORIGIN is not set/);
  });

  it('warns about an origin with a path (it would never match)', () => {
    const warnings = check({ CLIENT_ORIGIN: 'https://game.example.com/play' });

    expect(warnings[0]).toMatch(/not a plain origin/);
    expect(warnings[0]).toContain('https://game.example.com');
  });

  it('warns about an origin that is not a URL', () => {
    expect(check({ CLIENT_ORIGIN: 'game.example.com' })[0]).toMatch(/not a URL/);
  });

  it('warns when a hosted server allows any website', () => {
    expect(check({ NODE_ENV: 'production', CLIENT_ORIGIN: '*' })[0]).toMatch(/any website/);
    expect(check({ CLIENT_ORIGIN: '*' })).toEqual([]);
  });

  it('warns when a hosted client origin is plain http', () => {
    const warnings = check({ NODE_ENV: 'production', CLIENT_ORIGIN: 'http://game.example.com' });

    expect(warnings[0]).toMatch(/https/);
  });

  it('still allows http for localhost in production builds run locally', () => {
    expect(
      check({ NODE_ENV: 'production', CLIENT_ORIGIN: 'http://localhost:4173' }),
    ).toEqual([]);
  });

  it('reports every problem, one per origin', () => {
    const warnings = check({ CLIENT_ORIGIN: 'https://a.com/x,nope' });

    expect(warnings).toHaveLength(2);
  });
});
