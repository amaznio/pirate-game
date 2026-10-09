export interface ServerConfig {
  readonly port: number;
  /** Interface to listen on. Railway needs all of them. */
  readonly host: string;
  /** Origins allowed to open a socket (CORS). `*` allows any (development). */
  readonly clientOrigins: readonly string[];
  readonly maxRooms: number;
  /** How long a room with nobody connected is kept before it is dropped. */
  readonly idleRoomMs: number;
  /**
   * How long a player can be away from a running match before an AI sails
   * their ship for them.
   */
  readonly awayGraceMs: number;
}

function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads the server settings from environment variables:
 *
 *   PORT           port to listen on (Railway sets this)        default 3001
 *   HOST           interface to listen on                       default 0.0.0.0
 *   CLIENT_ORIGIN  allowed browser origin(s), comma separated   default http://localhost:5173
 *   MAX_ROOMS      most rooms alive at once                     default 100
 *   IDLE_ROOM_MINUTES  keep an empty room this long             default 10
 *   AWAY_GRACE_SECONDS  away this long and an AI takes the helm  default 15
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return {
    port: intFrom(env.PORT, 3001),
    host: env.HOST?.trim() || '0.0.0.0',
    clientOrigins: origins,
    maxRooms: intFrom(env.MAX_ROOMS, 100),
    idleRoomMs: intFrom(env.IDLE_ROOM_MINUTES, 10) * 60_000,
    awayGraceMs: intFrom(env.AWAY_GRACE_SECONDS, 15) * 1000,
  };
}
