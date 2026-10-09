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

/** True when this looks like a real deployment rather than local development. */
export function isHosted(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.RAILWAY_ENVIRONMENT);
}

/**
 * Settings that will start fine but are almost certainly wrong for a hosted
 * server. The usual one: forgetting CLIENT_ORIGIN, which makes every browser
 * connection fail with a CORS error while the server itself looks healthy.
 */
export function configWarnings(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const warnings: string[] = [];
  const hosted = isHosted(env);

  if (hosted && !env.CLIENT_ORIGIN?.trim()) {
    warnings.push(
      'CLIENT_ORIGIN is not set, so only http://localhost:5173 may connect. ' +
        'Set it to the public URL of the client (https://...).',
    );
  }

  for (const origin of config.clientOrigins) {
    if (origin === '*') {
      if (hosted) {
        warnings.push('CLIENT_ORIGIN is "*", so any website may open sockets to this server.');
      }
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      warnings.push(`CLIENT_ORIGIN entry "${origin}" is not a URL (use https://host).`);
      continue;
    }
    if (parsed.origin !== origin || !/^https?:$/.test(parsed.protocol)) {
      warnings.push(
        `CLIENT_ORIGIN entry "${origin}" is not a plain origin. ` +
          `Use ${parsed.origin === 'null' ? 'scheme://host[:port]' : parsed.origin} (no path).`,
      );
    } else if (hosted && parsed.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) {
      warnings.push(`CLIENT_ORIGIN entry "${origin}" uses http: a hosted client is served over https.`);
    }
  }

  return warnings;
}
