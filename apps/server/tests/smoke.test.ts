import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { runSmoke, type SmokeCheck } from '../scripts/smoke';
import type { GameServer } from '../src/gameServer';
import { startServer } from './helpers';

/** A stand-in for the deployed client: an HTML page and one script. */
class FakeClient {
  html = '<html><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
  script = '';
  status = 200;
  private readonly http: Server;

  private constructor() {
    this.http = createServer((request, response) => {
      if (this.status !== 200) {
        response.writeHead(this.status).end('nope');
      } else if (request.url === '/assets/app.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(this.script);
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(this.html);
      }
    });
  }

  static async start(): Promise<FakeClient> {
    const client = new FakeClient();
    await new Promise<void>((resolve) => client.http.listen(0, '127.0.0.1', resolve));
    return client;
  }

  get url(): string {
    return `http://127.0.0.1:${(this.http.address() as AddressInfo).port}`;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.http.close(() => resolve()));
  }
}

let server: GameServer | null = null;
let client: FakeClient | null = null;

afterEach(async () => {
  await server?.close();
  await client?.close();
  server = null;
  client = null;
});

const serverUrl = () => `http://127.0.0.1:${server!.port}`;

/** A correct setup: the server allows the client, the client points at the server. */
async function deploy(origins?: string[]) {
  client = await FakeClient.start();
  server = await startServer({ clientOrigins: origins ?? [client.url] });
  client.script = `const server = "${serverUrl()}";`;
}

const byName = (checks: SmokeCheck[], name: string) =>
  checks.find((check) => check.name === name)!;

describe('runSmoke', () => {
  it('passes every check against a correct deployment', async () => {
    await deploy();

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    expect(checks.map((check) => check.name)).toEqual([
      'Server is healthy',
      'Client page loads',
      'Client was built for this server',
      'Server accepts the client origin',
      'A player can connect and create a room',
      'A match starts on a generated sea',
    ]);
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(byName(checks, 'Server accepts the client origin').detail).toMatch(
      /other origins are not/,
    );
  });

  it('checks only the server when no client is given', async () => {
    await deploy();

    const checks = await runSmoke({ server: serverUrl() });

    expect(checks.map((check) => check.name)).toEqual([
      'Server is healthy',
      'A player can connect and create a room',
      'A match starts on a generated sea',
    ]);
    expect(checks.every((check) => check.ok)).toBe(true);
  });

  it('leaves no room behind', async () => {
    await deploy();

    await runSmoke({ server: serverUrl(), client: client!.url });
    server!.rooms.sweep();

    expect(server!.rooms.size).toBe(0);
  });

  it('tells you to set CLIENT_ORIGIN when the server does not allow the client', async () => {
    await deploy(['https://somewhere-else.example.com']);

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    const check = byName(checks, 'Server accepts the client origin');
    expect(check.ok).toBe(false);
    expect(check.detail).toContain(`CLIENT_ORIGIN=${client!.url}`);
    expect(byName(checks, 'Server is healthy').ok).toBe(true);
  });

  it('accepts a server that allows any origin, and says so', async () => {
    await deploy(['*']);

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    const check = byName(checks, 'Server accepts the client origin');
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/every other website/);
  });

  it('tells you to set VITE_SERVER_URL when the client was built for another server', async () => {
    await deploy();
    client!.script = 'const server = "https://some-other-server.example.com";';

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    const check = byName(checks, 'Client was built for this server');
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('VITE_SERVER_URL');
  });

  it('finds the server address even when the bundle is not the first script', async () => {
    await deploy();
    client!.html =
      '<div id="root"></div><script src="/assets/other.js"></script><script src="/assets/app.js"></script>';

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    expect(byName(checks, 'Client was built for this server').ok).toBe(true);
  });

  it('reports a client that does not serve the app', async () => {
    await deploy();
    client!.status = 502;

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    const check = byName(checks, 'Client page loads');
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('502');
  });

  it('reports a page that is not the app', async () => {
    await deploy();
    client!.html = '<html><body>Welcome to nginx</body></html>';

    const checks = await runSmoke({ server: serverUrl(), client: client!.url });

    expect(byName(checks, 'Client page loads').ok).toBe(false);
  });

  it('fails cleanly, without throwing, when nothing is listening', async () => {
    await deploy();
    const dead = serverUrl();
    await server!.close();
    server = null;

    const checks = await runSmoke({ server: dead, client: client!.url, timeoutMs: 2000 });

    expect(byName(checks, 'Server is healthy').ok).toBe(false);
    expect(byName(checks, 'Server is healthy').detail).toMatch(/Could not reach/);
    expect(byName(checks, 'A player can connect and create a room').ok).toBe(false);
  });

  it('notices when the server URL is really the client', async () => {
    await deploy();

    const checks = await runSmoke({ server: client!.url });

    const check = byName(checks, 'Server is healthy');
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/not the client/);
  });

  it('ignores trailing slashes on the addresses', async () => {
    await deploy();

    const checks = await runSmoke({ server: `${serverUrl()}/`, client: `${client!.url}/` });

    expect(checks.filter((check) => !check.ok)).toEqual([]);
  });
});
