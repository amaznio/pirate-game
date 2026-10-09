export interface ServerUrlCheck {
  /** `error` should stop the build; `warn` should be shown but is survivable. */
  readonly level: 'ok' | 'warn' | 'error';
  readonly message: string | null;
}

const OK: ServerUrlCheck = { level: 'ok', message: null };

/**
 * Checks `VITE_SERVER_URL` when the client is built. The value is baked into
 * the bundle, so a mistake here ships a client that cannot reach its server,
 * and the cheapest place to notice is the build.
 */
export function checkServerUrl(
  raw: string | undefined,
  production: boolean,
): ServerUrlCheck {
  const value = raw?.trim();
  if (!value) {
    return production
      ? {
          level: 'warn',
          message:
            'VITE_SERVER_URL is not set: this build has no online play, only ' +
            '"play against the computer". Set it to the game server URL (https://...).',
        }
      : OK;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      level: 'error',
      message:
        `VITE_SERVER_URL "${value}" is not a URL. Include the scheme, e.g. ` +
        `https://${value.replace(/^\/+/, '')}`,
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      level: 'error',
      message: `VITE_SERVER_URL must start with http:// or https:// (got ${url.protocol}//).`,
    };
  }

  // Socket.IO treats a path as a namespace, which silently breaks the connection.
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    return {
      level: 'error',
      message:
        `VITE_SERVER_URL "${value}" must be just the server's address ` +
        `(${url.origin}), with no path, query or fragment.`,
    };
  }

  if (
    production &&
    url.protocol === 'http:' &&
    !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)
  ) {
    return {
      level: 'warn',
      message:
        `VITE_SERVER_URL "${value}" is plain http. A client served over https ` +
        'cannot open an insecure socket; use https://.',
    };
  }

  return OK;
}
