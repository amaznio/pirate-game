import type { PublicRoomSummary } from '@pirate/game-core/protocol/messages';
import { parsePublicRoomList } from '@pirate/game-core/protocol/validate';

export interface FetchPublicRoomsOptions {
  /** Replaceable for tests. */
  fetchImpl?: typeof fetch;
  /** Give up after this long (ms). */
  timeoutMs?: number;
}

/**
 * Asks the server which public rooms can be joined. The reply is checked
 * before it is used: anything malformed is left out, never shown.
 */
export async function fetchPublicRooms(
  serverUrl: string,
  options: FetchPublicRoomsOptions = {},
): Promise<PublicRoomSummary[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    // The server marks the list `no-store`, so it is never served from a cache.
    const response = await fetchImpl(`${serverUrl.replace(/\/+$/, '')}/rooms`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The server answered ${response.status}.`);
    }
    return parsePublicRoomList(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
