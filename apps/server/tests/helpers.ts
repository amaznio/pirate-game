import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  JoinResult,
  ServerToClientEvents,
} from '@pirate/game-core/protocol/messages';
import type { PlayerActions } from '@pirate/game-core/domain/TurnResult';
import type { ServerConfig } from '../src/config';
import { createGameServer, type GameServer } from '../src/gameServer';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const testConfig: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigins: ['http://localhost:5173'],
  maxRooms: 50,
  idleRoomMs: 60_000,
  // Long, so a test that drops a connection is not taken over by an AI by
  // surprise. Tests about the takeover set a short one.
  awayGraceMs: 60_000,
};

export function startServer(overrides: Partial<ServerConfig> = {}): Promise<GameServer> {
  return createGameServer({ ...testConfig, ...overrides });
}

/** A connected test client that remembers everything the server sent it. */
export class TestClient {
  readonly history: Array<{ name: string; payload: unknown }> = [];
  private waiters: Array<() => void> = [];

  private constructor(readonly socket: ClientSocket) {
    socket.onAny((name: string, payload: unknown) => {
      this.history.push({ name, payload });
      this.waiters.forEach((wake) => wake());
    });
  }

  static async connect(port: number): Promise<TestClient> {
    const socket: ClientSocket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return new TestClient(socket);
  }

  /** Everything received under one event name, oldest first. */
  all<T>(name: string): T[] {
    return this.history.filter((entry) => entry.name === name).map((entry) => entry.payload as T);
  }

  /** Resolves with the first matching message received so far or arriving later. */
  waitFor<T>(
    name: string,
    predicate: (payload: T) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const check = () => {
        const found = this.all<T>(name).find(predicate);
        if (found !== undefined) {
          cleanup();
          resolve(found);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for "${name}"`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((wake) => wake !== check);
      };
      this.waiters.push(check);
      check();
    });
  }

  /** Sends a request that has an ack and returns the reply. */
  request<T extends object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
    return new Promise((resolve) => {
      (this.socket as unknown as { emit: (...a: unknown[]) => void }).emit(event, ...args, resolve);
    });
  }

  send(event: string, ...args: unknown[]): void {
    (this.socket as unknown as { emit: (...a: unknown[]) => void }).emit(event, ...args);
  }

  close(): void {
    this.socket.disconnect();
  }
}

export function noFire() {
  return Array.from({ length: 4 }, () => ({ left: false, right: false }));
}

export function plan(movement: PlayerActions['movement']): PlayerActions {
  return { movement, cannons: noFire() };
}

export function expectOk<T extends object>(result: Ack<T>): asserts result is { ok: true } & T {
  if (!result.ok) {
    throw new Error(`Expected ok but got ${result.error}: ${result.message}`);
  }
}

/** Creates a room as `name` and returns the client with its seat. */
export async function createRoom(
  port: number,
  name: string,
  options?: object,
): Promise<{ client: TestClient; seat: JoinResult }> {
  const client = await TestClient.connect(port);
  const result = await client.request<JoinResult>('room:create', { name, options });
  expectOk(result);
  return { client, seat: result };
}

export async function joinRoom(
  port: number,
  roomId: string,
  name: string,
): Promise<{ client: TestClient; seat: JoinResult }> {
  const client = await TestClient.connect(port);
  const result = await client.request<JoinResult>('room:join', { roomId, name });
  expectOk(result);
  return { client, seat: result };
}
