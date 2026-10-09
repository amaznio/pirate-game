import { randomBytes, randomInt } from 'node:crypto';

/** No 0/O, 1/I/L: room codes get read out and typed by people. */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  }
  return code;
}

/**
 * The key to a private room: longer than a code, so it cannot be found by
 * trying codes (31^8 is about 850 billion; a code has only 31^5, 28 million).
 */
export function newRoomKey(): string {
  return newRoomCode(8);
}

/** A secret that cannot be guessed (used to prove ownership of a seat). */
export function newSecret(): string {
  return randomBytes(24).toString('base64url');
}

export function newSeatId(): string {
  return `seat_${randomBytes(6).toString('base64url')}`;
}
