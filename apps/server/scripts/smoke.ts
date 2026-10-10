/**
 * Checks a running deployment from the outside, the way a browser would.
 *
 *   pnpm smoke --server https://game-server.up.railway.app \
 *              --client https://game.up.railway.app
 *
 * It answers the questions that go wrong in a first deploy: is the server up,
 * does the client page load, was the client built with the right server URL,
 * does the server accept connections from the client's origin, and can a
 * player really open a socket and create a room?
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import { pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';

export interface SmokeOptions {
  /** Base URL of the game server. */
  server: string;
  /** Base URL of the client. Without it only the server is checked. */
  client?: string;
  /** How long each network step may take (ms). */
  timeoutMs?: number;
}

export interface SmokeCheck {
  readonly name: string;
  readonly ok: boolean;
  /** What was found, or what to do about a failure. */
  readonly detail: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

async function timed<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    return cause?.code ?? cause?.message ?? error.message;
  }
  return String(error);
}

/** Runs every check. Never throws: a failure is a failed check. */
export async function runSmoke(options: SmokeOptions): Promise<SmokeCheck[]> {
  const server = trimSlash(options.server);
  const client = options.client ? trimSlash(options.client) : null;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const checks: SmokeCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail });

  // 1. The server is up.
  try {
    const response = await timed((signal) => fetch(`${server}/health`, { signal }), timeoutMs);
    const body = (await response.json().catch(() => null)) as { status?: string; rooms?: number } | null;
    if (response.ok && body?.status === 'ok') {
      add('Server is healthy', true, `${server}/health answered ok (${body.rooms ?? '?'} rooms open)`);
    } else {
      add('Server is healthy', false, `${server}/health answered ${response.status}. Is this the server's URL (not the client's)?`);
    }
  } catch (error) {
    add('Server is healthy', false, `Could not reach ${server}/health (${describeError(error)}). Is the service running and its domain generated?`);
  }

  // 2 and 3. The client loads and was built for this server.
  if (client) {
    let html = '';
    try {
      const response = await timed((signal) => fetch(`${client}/`, { signal }), timeoutMs);
      html = await response.text();
      const looksRight = response.ok && html.includes('id="root"');
      add(
        'Client page loads',
        looksRight,
        looksRight
          ? `${client}/ served the app`
          : `${client}/ answered ${response.status} without the app's root element.`,
      );
    } catch (error) {
      add('Client page loads', false, `Could not reach ${client} (${describeError(error)}).`);
    }

    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    let mentionsServer = false;
    for (const src of scripts) {
      try {
        const script = await timed(
          (signal) => fetch(new URL(src, `${client}/`), { signal }).then((r) => r.text()),
          timeoutMs,
        );
        if (script.includes(server)) {
          mentionsServer = true;
          break;
        }
      } catch {
        // Try the next script.
      }
    }
    add(
      'Client was built for this server',
      mentionsServer,
      mentionsServer
        ? `the client bundle points at ${server}`
        : `the client bundle does not contain ${server}. Set VITE_SERVER_URL on the client service and redeploy it (it is baked in at build time).`,
    );

    // 4. The server accepts connections from the client's origin.
    const origin = new URL(client).origin;
    const probe = async (asOrigin: string): Promise<boolean> => {
      const response = await timed(
        (signal) =>
          fetch(`${server}/socket.io/?EIO=4&transport=polling`, {
            headers: { Origin: asOrigin },
            signal,
          }),
        timeoutMs,
      );
      const header = response.headers.get('access-control-allow-origin');
      return header === asOrigin || header === '*';
    };
    try {
      if (await probe(origin)) {
        // A server that allows everything also allows a stranger.
        const open = await probe('https://smoke-test.invalid');
        add(
          'Server accepts the client origin',
          true,
          open
            ? `${origin} is allowed, but so is every other website (CLIENT_ORIGIN is "*"). Fine for development; set the client's URL for production.`
            : `${origin} is allowed and other origins are not`,
        );
      } else {
        add(
          'Server accepts the client origin',
          false,
          `the server did not allow ${origin}. Set CLIENT_ORIGIN=${origin} on the server service and redeploy it.`,
        );
      }
    } catch (error) {
      add('Server accepts the client origin', false, `Could not ask the server (${describeError(error)}).`);
    }
  }

  // 5. A real socket: connect, create a room, leave.
  const started = Date.now();
  const socket = io(server, {
    transports: ['websocket'],
    reconnection: false,
    timeout: timeoutMs,
    extraHeaders: client ? { Origin: new URL(client).origin } : undefined,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    const connectMs = Date.now() - started;

    const reply = await timed(
      (signal) =>
        new Promise<{ ok: boolean; roomId?: string; message?: string }>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('no answer')));
          socket.emit(
            'room:create',
            { name: 'Smoke test', options: { ais: 1, mapStyle: 'stormy', turnDurationSeconds: null } },
            resolve,
          );
        }),
      timeoutMs,
    );
    if (reply.ok && reply.roomId) {
      add('A player can connect and create a room', true, `websocket connected in ${connectMs} ms, created room ${reply.roomId}`);

      // 6. The room can start a match, and its sea is generated.
      try {
        const view = await timed(
          (signal) =>
            new Promise<{ obstacles?: object; terrain?: object }>((resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('no view arrived')));
              socket.once('game:view', (value) => resolve(value as { obstacles?: object; terrain?: object }));
              socket.emit('room:start', (result: { ok: boolean; message?: string }) => {
                if (!result.ok) {
                  reject(new Error(result.message ?? 'the server refused to start'));
                }
              });
            }),
          timeoutMs,
        );
        const rocks = Object.keys(view.obstacles ?? {}).length;
        const hazards = Object.keys(view.terrain ?? {}).length;
        add(
          'A match starts on a generated sea',
          rocks + hazards > 0,
          rocks + hazards > 0
            ? `the first view had ${rocks} rocks and ${hazards} wind or whirlpool cells`
            : 'the match started but its board was empty. Is the server up to date?',
        );
      } catch (error) {
        add('A match starts on a generated sea', false, `could not start a match (${describeError(error)}).`);
      }

      await new Promise<void>((resolve) => {
        socket.emit('room:leave', () => resolve());
        setTimeout(resolve, 1000);
      });
    } else {
      add('A player can connect and create a room', false, `the server refused: ${reply.message ?? 'unknown reason'}`);
    }
  } catch (error) {
    add(
      'A player can connect and create a room',
      false,
      `could not open a websocket to ${server} (${describeError(error)}). Check the service is running and that websockets are not blocked.`,
    );
  } finally {
    socket.disconnect();
  }

  return checks;
}

// --- Command line --------------------------------------------------------------

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const server = argument('server') ?? process.env.SMOKE_SERVER;
  const client = argument('client') ?? process.env.SMOKE_CLIENT;
  if (!server) {
    console.error('Usage: pnpm smoke --server <server url> [--client <client url>]');
    process.exit(2);
  }

  console.log(`Checking ${server}${client ? ` with client ${client}` : ''}\n`);
  const checks = await runSmoke({ server, client });
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}\n      ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok).length;
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

// Run only when started from the command line, not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
