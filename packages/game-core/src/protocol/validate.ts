import {
  ACTIONS_PER_TURN,
  MOVEMENT_ACTIONS,
  type MovementAction,
} from '../domain/Action';
import {
  AI_DIFFICULTIES,
  type AiDifficulty,
  type TokenGenerationConfig,
} from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  type PublicRoomSummary,
  type RoomOptions,
  type TeamMode,
} from './messages';

/**
 * Turns untrusted input (whatever arrived on the socket) into a well-formed
 * value, or null. These only check SHAPE and bounds; whether a plan is legal
 * for the player (tokens, cannonballs, phase) is the host's job.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plan: exactly four movement slots and four cannon slots. */
export function parsePlayerActions(value: unknown): PlayerActions | null {
  if (!isRecord(value)) {
    return null;
  }
  const { movement, cannons } = value;
  if (
    !Array.isArray(movement) ||
    !Array.isArray(cannons) ||
    movement.length !== ACTIONS_PER_TURN ||
    cannons.length !== ACTIONS_PER_TURN
  ) {
    return null;
  }

  const parsedMovement: Array<MovementAction | null> = [];
  for (const slot of movement) {
    if (slot === null) {
      parsedMovement.push(null);
    } else if (
      typeof slot === 'string' &&
      (MOVEMENT_ACTIONS as readonly string[]).includes(slot)
    ) {
      parsedMovement.push(slot as MovementAction);
    } else {
      return null;
    }
  }

  const parsedCannons: Array<{ left: boolean; right: boolean }> = [];
  for (const slot of cannons) {
    if (
      !isRecord(slot) ||
      typeof slot.left !== 'boolean' ||
      typeof slot.right !== 'boolean'
    ) {
      return null;
    }
    parsedCannons.push({ left: slot.left, right: slot.right });
  }

  return { movement: parsedMovement, cannons: parsedCannons };
}

/** A change to how the next movement token is chosen. */
export function parseTokenPatch(
  value: unknown,
): Partial<TokenGenerationConfig> | null {
  if (!isRecord(value)) {
    return null;
  }
  const patch: { auto?: boolean; requested?: MovementAction } = {};
  if ('auto' in value) {
    if (typeof value.auto !== 'boolean') {
      return null;
    }
    patch.auto = value.auto;
  }
  if ('requested' in value) {
    if (
      typeof value.requested !== 'string' ||
      !(MOVEMENT_ACTIONS as readonly string[]).includes(value.requested)
    ) {
      return null;
    }
    patch.requested = value.requested as MovementAction;
  }
  return patch;
}

/** A display name: trimmed, control characters removed, 1 to 20 characters. */
export function parseName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.slice(0, ROOM_LIMITS.maxNameLength);
}

/** A room code: letters and digits only, upper-cased. */
export function parseRoomId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(cleaned) ? cleaned : null;
}

/**
 * What a player types to join: a public room's code or a private room's key.
 * Letters and digits only, 3 to 12 long, upper-cased.
 */
export function parseJoinCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z0-9]{3,12}$/.test(cleaned) ? cleaned : null;
}

/** An opaque id or token: bounded length, no surprises. */
export function parseOpaqueId(value: unknown): string | null {
  return typeof value === 'string' && /^[\w-]{4,64}$/.test(value) ? value : null;
}

/**
 * Room options with anything missing filled from `base`. Returns null when a
 * given field is present but invalid (so the host is told, not silently ignored).
 */
export function parseRoomOptions(
  value: unknown,
  base: RoomOptions = DEFAULT_ROOM_OPTIONS,
): RoomOptions | null {
  if (value === undefined) {
    return base;
  }
  if (!isRecord(value)) {
    return null;
  }

  let { ais, aiDifficulty, teamMode, turnDurationSeconds, visibility } = base;

  if ('ais' in value) {
    if (
      typeof value.ais !== 'number' ||
      !Number.isInteger(value.ais) ||
      value.ais < 0 ||
      value.ais > ROOM_LIMITS.maxShips
    ) {
      return null;
    }
    ais = value.ais;
  }

  if ('aiDifficulty' in value) {
    if (
      typeof value.aiDifficulty !== 'string' ||
      !(AI_DIFFICULTIES as readonly string[]).includes(value.aiDifficulty)
    ) {
      return null;
    }
    aiDifficulty = value.aiDifficulty as AiDifficulty;
  }

  if ('visibility' in value) {
    if (value.visibility !== 'public' && value.visibility !== 'private') {
      return null;
    }
    visibility = value.visibility;
  }

  if ('teamMode' in value) {
    if (value.teamMode !== 'ffa' && value.teamMode !== 'teams') {
      return null;
    }
    teamMode = value.teamMode;
  }

  if ('turnDurationSeconds' in value) {
    const seconds = value.turnDurationSeconds;
    if (seconds === null) {
      turnDurationSeconds = null;
    } else if (
      typeof seconds === 'number' &&
      Number.isFinite(seconds) &&
      seconds >= ROOM_LIMITS.minTurnSeconds &&
      seconds <= ROOM_LIMITS.maxTurnSeconds
    ) {
      turnDurationSeconds = Math.round(seconds);
    } else {
      return null;
    }
  }

  return { ais, aiDifficulty, teamMode, turnDurationSeconds, visibility };
}

const TEAM_MODES = ['ffa', 'teams'] as const;

function smallInt(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

function parsePublicRoom(value: unknown): PublicRoomSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  const code = parseJoinCode(value.code);
  const hostName = parseName(value.hostName);
  const players = smallInt(value.players, ROOM_LIMITS.maxHumans);
  const maxPlayers = smallInt(value.maxPlayers, ROOM_LIMITS.maxHumans);
  const ais = smallInt(value.ais, ROOM_LIMITS.maxShips);
  const timer = value.turnDurationSeconds;
  if (
    code === null ||
    hostName === null ||
    players === null ||
    maxPlayers === null ||
    ais === null ||
    typeof value.aiDifficulty !== 'string' ||
    !(AI_DIFFICULTIES as readonly string[]).includes(value.aiDifficulty) ||
    typeof value.teamMode !== 'string' ||
    !(TEAM_MODES as readonly string[]).includes(value.teamMode) ||
    !(timer === null || (typeof timer === 'number' && Number.isFinite(timer) && timer > 0))
  ) {
    return null;
  }
  return {
    code,
    hostName,
    players,
    maxPlayers,
    ais,
    aiDifficulty: value.aiDifficulty as AiDifficulty,
    teamMode: value.teamMode as TeamMode,
    turnDurationSeconds: timer,
  };
}

/**
 * The public room list a server sent (`{ rooms: [...] }`), with anything
 * malformed left out. A page never shows something it has not checked.
 */
export function parsePublicRoomList(value: unknown, limit = 50): PublicRoomSummary[] {
  if (!isRecord(value) || !Array.isArray(value.rooms)) {
    return [];
  }
  const rooms: PublicRoomSummary[] = [];
  for (const entry of value.rooms) {
    const room = parsePublicRoom(entry);
    if (room) {
      rooms.push(room);
    }
    if (rooms.length >= limit) {
      break;
    }
  }
  return rooms;
}
