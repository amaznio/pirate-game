import type { MapStyle } from '../board/generateBoard';
import type { PlayerId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { AiDifficulty, TokenGenerationConfig } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import type { GameView } from '../view/GameView';

/**
 * The wire protocol between a client and the game server. Both sides import
 * these types, so they cannot drift apart. Everything here is plain JSON.
 *
 * Nothing a client sends is trusted: the server validates every payload
 * (protocol/validate.ts) and every plan (simulation/plans.ts).
 */

export type TeamMode = 'ffa' | 'teams';

/**
 * Who can find and join a room. A public room is listed for anyone and can be
 * joined with its short code. A private room is not listed and can only be
 * joined with its long key.
 */
export type RoomVisibility = 'public' | 'private';

/** What the host of a room can tune before the match starts. */
export interface RoomOptions {
  /** AI-controlled ships to add. */
  readonly ais: number;
  /** How well the AIs play. */
  readonly aiDifficulty: AiDifficulty;
  readonly teamMode: TeamMode;
  /** Planning time per turn in seconds, or null for no timer. */
  readonly turnDurationSeconds: number | null;
  readonly visibility: RoomVisibility;
  /** How many rocks, winds and whirlpools the generated board has. */
  readonly mapStyle: MapStyle;
}

export const ROOM_LIMITS = {
  maxShips: 16,
  maxHumans: 8,
  maxNameLength: 20,
  minTurnSeconds: 10,
  maxTurnSeconds: 120,
} as const;

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  ais: 1,
  aiDifficulty: 'normal',
  teamMode: 'ffa',
  turnDurationSeconds: 30,
  visibility: 'private',
  mapStyle: 'normal',
};

export type RoomStatus = 'lobby' | 'playing' | 'finished';

/** One human's place in a room. `playerId` is set once the match has started. */
export interface SeatInfo {
  readonly seatId: string;
  readonly name: string;
  readonly connected: boolean;
  readonly isHost: boolean;
  readonly playerId: PlayerId | null;
  /** An AI is sailing this player's ship (they are away, or left the match). */
  readonly aiControlled: boolean;
}

export interface LobbyState {
  /** The room's own id (what a remembered seat is tied to). */
  readonly roomId: string;
  /**
   * What to give a friend so they can join: the short code of a public room, or
   * the long key of a private one. Only people already in the room ever see it.
   */
  readonly shareCode: string;
  readonly status: RoomStatus;
  readonly seats: readonly SeatInfo[];
  readonly options: RoomOptions;
}

export type ErrorCode =
  | 'bad_request'
  | 'room_not_found'
  | 'room_full'
  | 'room_closed'
  | 'already_started'
  | 'not_host'
  | 'not_in_room'
  | 'too_many_attempts'
  | 'bad_credentials'
  | 'too_few_ships'
  | 'too_many_ships'
  | 'server_busy';

export type Ack<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: ErrorCode; readonly message: string };

// --- Client to server --------------------------------------------------------

export interface CreateRoomRequest {
  readonly name: string;
  readonly options?: Partial<RoomOptions>;
}

export interface JoinRoomRequest {
  /** A public room's code, or any room's key. */
  readonly code: string;
  readonly name: string;
}

/** A public room that is open for joining, as shown in the room list. */
export interface PublicRoomSummary {
  /** Join with this. */
  readonly code: string;
  readonly hostName: string;
  /** Humans in the room now, and the most it can hold. */
  readonly players: number;
  readonly maxPlayers: number;
  readonly ais: number;
  readonly aiDifficulty: AiDifficulty;
  readonly teamMode: TeamMode;
  readonly turnDurationSeconds: number | null;
}

/** Take a seat back after a dropped connection. */
export interface RejoinRoomRequest {
  readonly roomId: string;
  readonly seatId: string;
  readonly token: string;
}

/** What a client needs to keep so it can come back to its seat. */
export interface SeatCredentials {
  readonly roomId: string;
  readonly seatId: string;
  /** Secret: whoever holds it can play this seat. */
  readonly token: string;
}

export interface JoinResult extends SeatCredentials {
  readonly lobby: LobbyState;
  /** Rejoining only: an AI sailed for this player while they were away. */
  readonly wasAiControlled: boolean;
}

export interface ClientToServerEvents {
  'room:create': (
    request: CreateRoomRequest,
    ack: (result: Ack<JoinResult>) => void,
  ) => void;
  'room:join': (
    request: JoinRoomRequest,
    ack: (result: Ack<JoinResult>) => void,
  ) => void;
  'room:rejoin': (
    request: RejoinRoomRequest,
    ack: (result: Ack<JoinResult>) => void,
  ) => void;
  /** Host only, before the match starts. */
  'room:configure': (
    options: Partial<RoomOptions>,
    ack: (result: Ack<{ lobby: LobbyState }>) => void,
  ) => void;
  /** Host only. */
  'room:start': (ack: (result: Ack<Record<string, never>>) => void) => void;
  /** Gives up the seat for good (in the lobby it is removed; the token stops working). */
  'room:leave': (ack?: () => void) => void;

  /** The plan being worked on (keeps it safe across a reconnect; not locked in). */
  'game:draft': (plan: PlayerActions) => void;
  /** The final plan. */
  'game:lockIn': (plan: PlayerActions) => void;
  'game:tokens': (patch: Partial<TokenGenerationConfig>) => void;
  /** The client has finished animating the last turn. */
  'game:ack': () => void;
}

// --- Server to client --------------------------------------------------------

export interface ServerToClientEvents {
  'lobby:update': (lobby: LobbyState) => void;
  /** The match has begun (or this seat has been restored into a running one). */
  'game:started': (info: { playerId: PlayerId }) => void;
  /** This player's redacted view. Sent after every change. */
  'game:view': (view: GameView) => void;
  /** The events of a resolved turn, for the client to animate. */
  'game:turn': (turn: { events: GameEvent[] }) => void;
  /** A plan was refused (it is not locked in). */
  'game:rejected': (info: { reason: string }) => void;
  'room:closed': (info: { reason: string }) => void;
}
