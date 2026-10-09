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

/** A secret that cannot be guessed (used to prove ownership of a seat). */
export function newSecret(): string {
  return randomBytes(24).toString('base64url');
}

export function newSeatId(): string {
  return `seat_${randomBytes(6).toString('base64url')}`;
}
