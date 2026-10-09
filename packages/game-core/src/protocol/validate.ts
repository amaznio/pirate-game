import {
  ACTIONS_PER_TURN,
  MOVEMENT_ACTIONS,
  type MovementAction,
} from '../domain/Action';
import type { TokenGenerationConfig } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  type RoomOptions,
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

  let { ais, teamMode, turnDurationSeconds } = base;

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

  return { ais, teamMode, turnDurationSeconds };
}
