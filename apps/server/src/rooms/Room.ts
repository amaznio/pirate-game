import type { Socket } from 'socket.io';
import type { PlayerId } from '@pirate/game-core/domain/Entity';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { GameState, TokenGenerationConfig } from '@pirate/game-core/domain/GameState';
import type { PlayerActions } from '@pirate/game-core/domain/TurnResult';
import { GameController } from '@pirate/game-core/controller/GameController';
import { EventBus } from '@pirate/game-core/events/EventBus';
import { randomSeed } from '@pirate/game-core/config/seed';
import {
  DEFAULT_RULES,
  createSkirmishConfig,
} from '@pirate/game-core/config/matchConfig';
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  type ClientToServerEvents,
  type ErrorCode,
  type LobbyState,
  type PublicRoomSummary,
  type RoomOptions,
  type RoomStatus,
  type SeatInfo,
  type ServerToClientEvents,
} from '@pirate/game-core/protocol/messages';
import { redactState } from '@pirate/game-core/view/redact';
import { newSecret, newSeatId } from '../ids';

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** A refusal the client should hear about (as opposed to a bug). */
export class RoomError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** One human's place in a room. */
export interface Seat {
  readonly seatId: string;
  /** Secret that proves ownership of the seat when reconnecting. */
  readonly token: string;
  readonly name: string;
  /** The live connection, or null while the player is away. */
  socket: GameSocket | null;
  /** Set when the match starts. */
  playerId: PlayerId | null;
  /** The player left on purpose: the token no longer restores this seat. */
  abandoned: boolean;
  /** An AI is sailing this ship while the player is away. */
  aiControlled: boolean;
  /** Counts down to an AI taking over after the player drops. */
  awayTimer: ReturnType<typeof setTimeout> | null;
  /** Tells the host this seat's client is connected (undoes registerClient). */
  disconnectFromHost: (() => void) | null;
}

/**
 * One room: a lobby that becomes one authoritative match. The room is the only
 * place that talks to both sockets and the host: it turns each state change
 * into a redacted view per seat, and each client message into a host call.
 */
export class Room {
  status: RoomStatus = 'lobby';
  options: RoomOptions;
  /** Updated on every message, so abandoned rooms can be swept. */
  lastActivity = Date.now();

  private readonly seats = new Map<string, Seat>();
  private hostSeatId: string | null = null;
  private host: GameController | null = null;
  private readonly bus = new EventBus();
  private turnEvents: GameEvent[] = [];
  private cleanups: Array<() => void> = [];
  private closed = false;

  /** When the room was opened (the room list shows the newest first). */
  readonly createdAt = Date.now();

  constructor(
    readonly id: string,
    /** What lets people into this room while it is private. */
    readonly key: string,
    options: Partial<RoomOptions> = {},
    /** How long a player may be away from a running match before an AI steps in. */
    private readonly awayGraceMs = 15_000,
  ) {
    this.options = { ...DEFAULT_ROOM_OPTIONS, ...options };
  }

  // --- Seats ---------------------------------------------------------------

  /** Takes a seat in the lobby. */
  join(name: string, socket: GameSocket): Seat {
    this.touch();
    if (this.status !== 'lobby') {
      throw new RoomError('already_started', 'That match has already started.');
    }
    if (
      this.seats.size >= ROOM_LIMITS.maxHumans ||
      this.seats.size + 1 + this.options.ais > ROOM_LIMITS.maxShips
    ) {
      throw new RoomError('room_full', 'That room is full.');
    }

    const seat: Seat = {
      seatId: newSeatId(),
      token: newSecret(),
      name,
      socket,
      playerId: null,
      abandoned: false,
      aiControlled: false,
      awayTimer: null,
      disconnectFromHost: null,
    };
    this.seats.set(seat.seatId, seat);
    this.hostSeatId ??= seat.seatId;
    this.broadcastLobby();
    return seat;
  }

  /** Finds a seat by id and secret (constant-shape check, no hints on failure). */
  authenticate(seatId: string, token: string): Seat | null {
    const seat = this.seats.get(seatId);
    return seat && !seat.abandoned && seat.token === token ? seat : null;
  }

  getSeat(seatId: string): Seat | undefined {
    return this.seats.get(seatId);
  }

  /** Brings a player back to their seat on a new connection. */
  reconnect(seat: Seat, socket: GameSocket): void {
    this.touch();
    const previous = seat.socket;
    seat.socket = socket;
    if (previous && previous !== socket) {
      // A second tab or a stale connection: the newest one wins.
      previous.emit('room:closed', { reason: 'Opened in another window.' });
      previous.disconnect(true);
    }

    if (this.host && seat.playerId) {
      // Back in time (or after an AI stepped in): the player takes the helm
      // again before they are sent anything, so their first view is in command.
      this.clearAwayTimer(seat);
      this.giveBackControl(seat);
      seat.disconnectFromHost?.();
      seat.disconnectFromHost = this.host.registerClient(seat.playerId);
      this.sendStarted(seat);
      this.sendView(seat);
      const pending = this.host.getPendingTurn();
      if (pending) {
        socket.emit('game:turn', { events: pending.events });
      }
    }
    this.broadcastLobby();
  }

  /** A connection dropped. The seat stays, so the player can come back. */
  disconnect(seatId: string, socket: GameSocket): void {
    const seat = this.seats.get(seatId);
    // Ignore a stale socket (the seat has already moved to a newer connection).
    if (!seat || seat.socket !== socket) {
      return;
    }
    this.touch();
    seat.socket = null;
    seat.disconnectFromHost?.();
    seat.disconnectFromHost = null;

    if (this.status === 'lobby') {
      this.passHostOn(seatId);
    } else {
      this.startAwayTimer(seat);
    }
    this.broadcastLobby();
  }

  /**
   * A player leaves for good. In the lobby their seat disappears; in a running
   * match it stays (their ship is still in the fight) but nobody can reclaim it.
   */
  leave(seatId: string, socket: GameSocket): void {
    const seat = this.seats.get(seatId);
    if (!seat || seat.socket !== socket) {
      return;
    }
    this.touch();
    seat.abandoned = true;
    seat.socket = null;
    seat.disconnectFromHost?.();
    seat.disconnectFromHost = null;

    if (this.status === 'lobby') {
      this.seats.delete(seatId);
      this.passHostOn(seatId);
    } else {
      // They are not coming back, so there is nothing to wait for.
      this.takeOver(seat);
    }
    this.broadcastLobby();
  }

  // --- AI standing in for an absent player ---------------------------------

  /** After the grace period an AI takes over a ship whose player is still away. */
  private startAwayTimer(seat: Seat): void {
    if (!this.host || !seat.playerId || seat.aiControlled) {
      return;
    }
    this.clearAwayTimer(seat);
    seat.awayTimer = setTimeout(() => {
      seat.awayTimer = null;
      if (!seat.socket) {
        this.takeOver(seat);
        this.broadcastLobby();
      }
    }, this.awayGraceMs);
    seat.awayTimer.unref();
  }

  private clearAwayTimer(seat: Seat): void {
    if (seat.awayTimer) {
      clearTimeout(seat.awayTimer);
      seat.awayTimer = null;
    }
  }

  /** An AI sails the player's ship from now on (until they come back, if they can). */
  private takeOver(seat: Seat): void {
    this.clearAwayTimer(seat);
    if (!this.host || !seat.playerId || seat.aiControlled || this.closed) {
      return;
    }
    seat.aiControlled = true;
    this.host.setController(seat.playerId, 'ai');
  }

  /** The player is back: they command their own ship again. */
  private giveBackControl(seat: Seat): void {
    if (!this.host || !seat.playerId || !seat.aiControlled) {
      return;
    }
    seat.aiControlled = false;
    this.host.setController(seat.playerId, 'human');
  }

  /** If the host is gone, the first connected player takes over. */
  private passHostOn(leavingSeatId: string): void {
    if (this.hostSeatId !== leavingSeatId) {
      return;
    }
    const next = [...this.seats.values()].find(
      (other) => other.socket && other.seatId !== leavingSeatId,
    );
    this.hostSeatId = next?.seatId ?? (this.seats.has(leavingSeatId) ? leavingSeatId : null);
  }

  seatCount(): number {
    return this.seats.size;
  }

  connectedCount(): number {
    let count = 0;
    for (const seat of this.seats.values()) {
      if (seat.socket) {
        count += 1;
      }
    }
    return count;
  }

  // --- Lobby ---------------------------------------------------------------

  lobbyState(): LobbyState {
    const seats: SeatInfo[] = [...this.seats.values()].map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      connected: seat.socket !== null,
      isHost: seat.seatId === this.hostSeatId,
      playerId: seat.playerId,
      aiControlled: seat.aiControlled,
    }));
    return {
      roomId: this.id,
      shareCode: this.shareCode(),
      status: this.status,
      seats,
      options: this.options,
    };
  }

  /** What to give a friend: the short code if the room is public, else the key. */
  shareCode(): string {
    return this.options.visibility === 'public' ? this.id : this.key;
  }

  /**
   * How the room appears in the public list, or null if it should not appear:
   * private, already started, empty, or full.
   */
  publicSummary(): PublicRoomSummary | null {
    if (this.status !== 'lobby' || this.options.visibility !== 'public') {
      return null;
    }
    const players = this.connectedCount();
    const maxPlayers = Math.min(
      ROOM_LIMITS.maxHumans,
      ROOM_LIMITS.maxShips - this.options.ais,
    );
    if (players === 0 || this.seats.size >= maxPlayers) {
      return null;
    }
    const host = this.hostSeatId ? this.seats.get(this.hostSeatId) : undefined;
    return {
      code: this.id,
      hostName: host?.name ?? 'Unknown',
      players,
      maxPlayers,
      ais: this.options.ais,
      aiDifficulty: this.options.aiDifficulty,
      teamMode: this.options.teamMode,
      turnDurationSeconds: this.options.turnDurationSeconds,
    };
  }

  /** Host only: changes the options before the match starts. */
  configure(seatId: string, options: RoomOptions): void {
    this.touch();
    this.requireHost(seatId);
    if (this.status !== 'lobby') {
      throw new RoomError('already_started', 'The match has already started.');
    }
    if (this.seats.size + options.ais > ROOM_LIMITS.maxShips) {
      throw new RoomError('too_many_ships', 'That is more ships than a match allows.');
    }
    this.options = options;
    this.broadcastLobby();
  }

  /** Host only: turns the lobby into a match with whoever is connected. */
  start(seatId: string): void {
    this.touch();
    this.requireHost(seatId);
    if (this.status !== 'lobby') {
      throw new RoomError('already_started', 'The match has already started.');
    }

    // Anyone who dropped before the start does not take part.
    const players = [...this.seats.values()].filter((seat) => seat.socket);
    for (const seat of [...this.seats.values()]) {
      if (!seat.socket) {
        this.seats.delete(seat.seatId);
      }
    }

    const total = players.length + this.options.ais;
    if (total < 2) {
      throw new RoomError(
        'too_few_ships',
        'A match needs at least two ships. Add an AI or wait for a friend.',
      );
    }
    if (total > ROOM_LIMITS.maxShips) {
      throw new RoomError('too_many_ships', 'That is more ships than a match allows.');
    }

    const base = createSkirmishConfig({
      humans: players.length,
      ais: this.options.ais,
      aiDifficulty: this.options.aiDifficulty,
      teamMode: this.options.teamMode,
      sea: this.options.mapStyle,
      seed: randomSeed(),
      rules: {
        ...DEFAULT_RULES,
        turnDurationSeconds: this.options.turnDurationSeconds,
      },
    });
    const config = {
      ...base,
      participants: base.participants.map((participant, index) =>
        index < players.length
          ? { ...participant, name: players[index].name }
          : participant,
      ),
    };

    players.forEach((seat, index) => {
      seat.playerId = config.participants[index].playerId;
    });

    const host = new GameController(this.bus, { config });
    this.host = host;
    this.status = 'playing';

    this.cleanups.push(
      this.bus.on((event) => this.collectEvent(event)),
      host.subscribe((state) => this.onState(state)),
    );
    for (const seat of players) {
      seat.disconnectFromHost = host.registerClient(seat.playerId as PlayerId);
      this.sendStarted(seat);
      this.sendView(seat);
    }
    this.broadcastLobby();
  }

  // --- Match ---------------------------------------------------------------

  /** The player's work-in-progress plan. */
  draft(seatId: string, plan: PlayerActions): void {
    const player = this.activePlayer(seatId);
    if (!player) return;
    this.reject(seatId, this.host!.submitDraft(player, plan));
  }

  /** The player's final plan. */
  lockIn(seatId: string, plan: PlayerActions): void {
    const player = this.activePlayer(seatId);
    if (!player) return;
    this.reject(seatId, this.host!.submitPlayerPlan(player, plan));
  }

  tokens(seatId: string, patch: Partial<TokenGenerationConfig>): void {
    const player = this.activePlayer(seatId);
    if (player) {
      this.host!.setTokenGeneration(player, patch);
    }
  }

  /** The player's client finished animating the last turn. */
  acknowledge(seatId: string): void {
    const player = this.activePlayer(seatId);
    if (player) {
      this.host!.acknowledgeTurn(player);
    }
  }

  /** Ends the room: tells everyone, stops the timer, forgets the match. */
  close(reason: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const seat of this.seats.values()) {
      this.clearAwayTimer(seat);
      seat.socket?.emit('room:closed', { reason });
      seat.disconnectFromHost?.();
    }
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups = [];
    this.host?.dispose();
    this.host = null;
  }

  // --- Internals -----------------------------------------------------------

  private touch(): void {
    this.lastActivity = Date.now();
  }

  private requireHost(seatId: string): void {
    if (seatId !== this.hostSeatId) {
      throw new RoomError('not_host', 'Only the host can do that.');
    }
  }

  /** The player id for a seat, if a match is running. */
  private activePlayer(seatId: string): PlayerId | null {
    this.touch();
    if (!this.host || this.status === 'lobby') {
      return null;
    }
    return this.seats.get(seatId)?.playerId ?? null;
  }

  private reject(seatId: string, reason: string | null): void {
    if (reason) {
      this.seats.get(seatId)?.socket?.emit('game:rejected', { reason });
    }
  }

  private broadcastLobby(): void {
    const lobby = this.lobbyState();
    for (const seat of this.seats.values()) {
      seat.socket?.emit('lobby:update', lobby);
    }
  }

  private sendStarted(seat: Seat): void {
    if (seat.playerId) {
      seat.socket?.emit('game:started', { playerId: seat.playerId });
    }
  }

  private sendView(seat: Seat, state: GameState | null = null): void {
    if (!this.host || !seat.playerId || !seat.socket) {
      return;
    }
    seat.socket.emit(
      'game:view',
      redactState(
        state ?? this.host.getState(),
        seat.playerId,
        this.host.getPlanningSecondsRemaining(),
      ),
    );
  }

  /** Every state change goes to every connected player, each as their own view. */
  private onState(state: GameState): void {
    for (const seat of this.seats.values()) {
      this.sendView(seat, state);
    }
    if (state.status === 'game_over' && this.status === 'playing') {
      this.status = 'finished';
      this.broadcastLobby();
    }
  }

  /** Events are public; they go out together once the turn is fully resolved. */
  private collectEvent(event: GameEvent): void {
    this.turnEvents.push(event);
    if (event.type !== 'TURN_ENDED') {
      return;
    }
    const events = this.turnEvents;
    this.turnEvents = [];
    for (const seat of this.seats.values()) {
      seat.socket?.emit('game:turn', { events });
    }
  }
}
