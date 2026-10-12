import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRoomSummary } from '@pirate/game-core/protocol/messages';
import { fetchPublicRooms } from '../../online/publicRooms';

export interface PublicRoomsState {
  readonly rooms: readonly PublicRoomSummary[];
  /** The first load has not finished yet. */
  readonly loading: boolean;
  /** Set when the last refresh failed; the previous list is kept. */
  readonly failed: boolean;
  readonly refresh: () => void;
}

/**
 * The public room list, refreshed every few seconds while the page is visible.
 * Does nothing when there is no server.
 */
export function usePublicRooms(
  serverUrl: string | null,
  intervalMs = 5000,
): PublicRoomsState {
  const [rooms, setRooms] = useState<readonly PublicRoomSummary[]>([]);
  const [loading, setLoading] = useState(serverUrl !== null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!serverUrl || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const next = await fetchPublicRooms(serverUrl);
      if (alive.current) {
        setRooms(next);
        setFailed(false);
      }
    } catch {
      if (alive.current) {
        setFailed(true);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setLoading(false);
      }
    }
  }, [serverUrl]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { rooms, loading, failed, refresh: () => void load() };
}
