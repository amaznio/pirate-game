import { io } from 'socket.io-client';
import type { PlayerId } from '@pirate/game-core/domain/Entity';
import { GameClient } from '@pirate/game-core/client/GameClient';
import type {
  Ack,
  JoinResult,
  LobbyState,
  RoomOptions,
  SeatCredentials,
} from '@pirate/game-core/protocol/messages';
import { SocketTransport, type GameSocket } from './SocketTransport';

/** Where a seat is remembered so the player can come back after a refresh. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

/** What the UI shows: the menu, a room that has not started, or the match. */
export type Phase = 'menu' | 'lobby' | 'playing';

export interface SessionState {
  readonly phase: Phase;
  readonly connection: ConnectionState;
  readonly lobby: LobbyState | null;
  /** This player's seat in the room. */
  readonly seatId: string | null;
  readonly client: GameClient | null;
  /** Trying to get back into a room remembered from before a refresh. */
  readonly resuming: boolean;
  /** Something the player should be told (an error, or why they were removed). */
  readonly message: string | null;
  /** The last plan the server refused (shown briefly). */
  readonly notice: string | null;
}

export interface OnlineSessionOptions {
  serverUrl: string;
  storage: KeyValueStore;
  /** How long to wait for the server before giving up (ms). */
  timeoutMs?: number;
  /** Replaceable for tests. */
  connect?: (url: string) => GameSocket;
}

const SEAT_KEY = 'pirate:seat';

interface SavedSeat extends SeatCredentials {
  readonly serverUrl: string;
}

const INITIAL: SessionState = {
  phase: 'menu',
  connection: 'idle',
  lobby: null,
  seatId: null,
  client: null,
  resuming: false,
  message: null,
  notice: null,
};

export class OnlineSession {
  private state: SessionState = INITIAL;
  private readonly listeners = new Set<() => void>();

  private socket: GameSocket | null = null;
  private credentials: SeatCredentials | null = null;
  private playerId: PlayerId | null = null;
  private transport: SocketTransport | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly options: OnlineSessionOptions) {
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  // --- State for the UI ----------------------------------------------------

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  // --- Actions -------------------------------------------------------------

  /** Opens a new room and takes the first seat. */
  async createRoom(name: string, roomOptions?: Partial<RoomOptions>): Promise<boolean> {
    return this.enter('room:create', { name, options: roomOptions });
  }

  /**
   * Takes a seat in someone else's room, with a public room's code or a private
   * room's key.
   */
  async joinRoom(code: string, name: string): Promise<boolean> {
    return this.enter('room:join', { code, name });
  }

  /** Host only: changes the room's options. */
  async configure(roomOptions: Partial<RoomOptions>): Promise<void> {
    const result = await this.request<{ lobby: LobbyState }>('room:configure', roomOptions);
    if (result?.ok) {
      this.set({ lobby: result.lobby, message: null });
    } else if (result) {
      this.set({ message: result.message });
    }
  }

  /** Host only: starts the match. The match arrives as the first view. */
  async start(): Promise<void> {
    const result = await this.request<Record<string, never>>('room:start');
    if (result && !result.ok) {
      this.set({ message: result.message });
    }
  }

  /**
   * Picks a remembered seat back up (after a page refresh). Quietly does
   * nothing if there is no seat, and forgets the seat if the room is gone.
   */
  async resume(): Promise<void> {
    const saved = this.readSavedSeat();
    if (!saved) {
      return;
    }
    this.credentials = saved;
    this.set({ resuming: true, message: null });
    try {
      await this.ensureConnected();
    } catch {
      this.credentials = null;
      this.set({ resuming: false });
      return;
    }
    // `connect` has already started the rejoin; it settles `resuming`.
  }

  /** Gives up the seat and goes back to the menu. */
  leave(message: string | null = null): void {
    this.reset(message, true);
  }

  // --- Connecting ----------------------------------------------------------

  /** Opens the connection if needed and waits until it is usable. */
  private ensureConnected(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }
    if (!this.socket) {
      this.set({ connection: 'connecting' });
      this.socket = this.attach((this.options.connect ?? defaultConnect)(this.options.serverUrl));
    }
    const socket = this.socket;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Could not reach the game server.'));
      }, this.timeoutMs);
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
      };
      socket.on('connect', onConnect);
      if (socket.connected) {
        onConnect();
      }
    });
  }

  private attach(socket: GameSocket): GameSocket {
    socket.on('connect', () => {
      this.set({ connection: 'connected' });
      // A connection that came back (or a remembered seat on startup) must
      // claim its seat again before anything else is sent.
      if (this.credentials) {
        void this.rejoin();
      }
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        return;
      }
      this.set({ connection: this.credentials ? 'reconnecting' : 'idle' });
    });

    socket.io.on('reconnect_attempt', () => {
      if (this.credentials) {
        this.set({ connection: 'reconnecting' });
      }
    });

    socket.on('lobby:update', (lobby) => this.set({ lobby }));

    socket.on('game:started', ({ playerId }) => {
      this.playerId = playerId;
    });

    socket.on('game:view', (view) => {
      // The first view of a match is what turns the lobby into the game.
      if (this.transport || !this.playerId) {
        return;
      }
      const transport = new SocketTransport(socket, this.playerId, view, {
        onLeave: () => this.leave(),
      });
      this.transport = transport;
      this.set({
        client: new GameClient(transport),
        phase: 'playing',
        resuming: false,
        message: null,
      });
    });

    socket.on('game:rejected', ({ reason }) => this.showNotice(reason));

    socket.on('room:closed', ({ reason }) => this.reset(reason));

    return socket;
  }

  /** Claims the remembered seat on a (new) connection. */
  private async rejoin(): Promise<void> {
    const credentials = this.credentials;
    if (!credentials) {
      return;
    }
    const result = await this.request<JoinResult>('room:rejoin', {
      roomId: credentials.roomId,
      seatId: credentials.seatId,
      token: credentials.token,
    });
    if (!result) {
      // Could not even ask (the connection dropped again); the next connect retries.
      return;
    }
    if (!result.ok) {
      this.reset(
        this.state.resuming ? null : 'Your match is no longer available.',
      );
      return;
    }
    this.set({
      lobby: result.lobby,
      seatId: result.seatId,
      resuming: false,
      phase: this.transport ? 'playing' : result.lobby.status === 'lobby' ? 'lobby' : this.state.phase,
    });
    this.transport?.flush();
    if (result.wasAiControlled) {
      this.showNotice('ai_took_over');
    }
  }

  // --- Entering a room -----------------------------------------------------

  private async enter(
    event: 'room:create' | 'room:join',
    payload: object,
  ): Promise<boolean> {
    this.set({ message: null });
    try {
      await this.ensureConnected();
    } catch (error) {
      this.set({ message: (error as Error).message });
      this.disconnectSocket();
      return false;
    }

    const result = await this.request<JoinResult>(event, payload);
    if (!result) {
      this.set({ message: 'The game server did not answer.' });
      return false;
    }
    if (!result.ok) {
      this.set({ message: result.message });
      return false;
    }

    this.credentials = {
      roomId: result.roomId,
      seatId: result.seatId,
      token: result.token,
    };
    this.saveSeat(this.credentials);
    this.set({
      phase: 'lobby',
      lobby: result.lobby,
      seatId: result.seatId,
      message: null,
    });
    return true;
  }

  // --- Plumbing ------------------------------------------------------------

  /** Sends a request and waits for its answer; null if there is none in time. */
  private request<T extends object>(
    event: string,
    ...args: unknown[]
  ): Promise<Ack<T> | null> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), this.timeoutMs);
      (socket as unknown as { emit: (...a: unknown[]) => void }).emit(event, ...args, (result: Ack<T>) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  private showNotice(notice: string): void {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.set({ notice });
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), 4000);
  }

  /** Forgets the room and returns to the menu. */
  private reset(message: string | null, farewell = false): void {
    this.credentials = null;
    this.playerId = null;
    this.clearSavedSeat();
    this.transport?.dispose();
    this.transport = null;
    this.disconnectSocket(farewell);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.state = { ...INITIAL, message };
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  /**
   * Closes the connection. With `farewell` the server is told the seat is given
   * up first, and the connection is closed once it has answered (or after a
   * second), so the goodbye cannot be lost to the socket closing under it.
   */
  private disconnectSocket(farewell = false): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    socket.removeAllListeners();
    socket.io.off('reconnect_attempt');

    if (farewell && socket.connected) {
      const close = () => socket.disconnect();
      socket.emit('room:leave', close);
      setTimeout(close, 1000).unref?.();
    } else {
      socket.disconnect();
    }
  }

  private saveSeat(credentials: SeatCredentials): void {
    const saved: SavedSeat = { ...credentials, serverUrl: this.options.serverUrl };
    try {
      this.options.storage.setItem(SEAT_KEY, JSON.stringify(saved));
    } catch {
      // Storage can be unavailable (private mode); the seat just is not remembered.
    }
  }

  private clearSavedSeat(): void {
    try {
      this.options.storage.removeItem(SEAT_KEY);
    } catch {
      // Nothing to forget.
    }
  }

  private readSavedSeat(): SeatCredentials | null {
    try {
      const raw = this.options.storage.getItem(SEAT_KEY);
      if (!raw) {
        return null;
      }
      const saved = JSON.parse(raw) as Partial<SavedSeat>;
      if (
        saved.serverUrl !== this.options.serverUrl ||
        typeof saved.roomId !== 'string' ||
        typeof saved.seatId !== 'string' ||
        typeof saved.token !== 'string'
      ) {
        return null;
      }
      return { roomId: saved.roomId, seatId: saved.seatId, token: saved.token };
    } catch {
      return null;
    }
  }
}

function defaultConnect(url: string): GameSocket {
  return io(url, {
    // Fail over to long-polling if websockets are blocked.
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
  });
}
