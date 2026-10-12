import type { TFunction } from 'i18next';

/**
 * A message from the server or the session, kept as a stable code plus the
 * server's own English text. The code is translated at render time; the text is
 * the fallback so a newer server message still shows something.
 */
export interface TranslatableMessage {
  readonly code: string | null;
  readonly text: string | null;
}

/** Every code we know how to translate, mapped to its catalog key. */
const ERROR_KEYS = {
  // ErrorCode, from an Ack
  bad_request: 'error.badRequest',
  room_not_found: 'error.roomNotFound',
  room_full: 'error.roomFull',
  room_closed: 'error.roomClosed',
  already_started: 'error.alreadyStarted',
  not_host: 'error.notHost',
  not_in_room: 'error.notInRoom',
  too_many_attempts: 'error.tooManyAttempts',
  bad_credentials: 'error.badCredentials',
  too_few_ships: 'error.tooFewShips',
  too_many_ships: 'error.tooManyShips',
  server_busy: 'error.serverBusy',
  // RoomClosedCode, from room:closed
  other_window: 'error.otherWindow',
  server_shutting_down: 'error.serverShuttingDown',
  create_failed: 'error.createFailed',
  // Raised by the session itself
  client_could_not_reach: 'error.couldNotReach',
  client_no_answer: 'error.noAnswer',
  client_match_gone: 'error.matchGone',
} as const;

/** The message to show: the translated code if known, else the raw text. */
export function humanMessage(
  t: TFunction,
  message: TranslatableMessage | null,
): string | null {
  if (!message) {
    return null;
  }
  const key =
    message.code && message.code in ERROR_KEYS
      ? ERROR_KEYS[message.code as keyof typeof ERROR_KEYS]
      : null;
  return key ? t(key) : message.text;
}
