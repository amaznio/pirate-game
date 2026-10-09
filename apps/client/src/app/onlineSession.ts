import { useSyncExternalStore } from 'react';
import {
  OnlineSession,
  type KeyValueStore,
  type SessionState,
} from '../online/OnlineSession';
import { resolveServerUrl } from '../online/serverUrl';

/** localStorage when it works, otherwise a throwaway in-memory store. */
function safeStorage(): KeyValueStore {
  try {
    const probe = '__pirate_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

export const serverUrl = resolveServerUrl();

/** The one online session for this page, or null when there is no server. */
export const onlineSession: OnlineSession | null = serverUrl
  ? new OnlineSession({ serverUrl, storage: safeStorage() })
  : null;

const OFFLINE_STATE: SessionState = {
  phase: 'menu',
  connection: 'idle',
  lobby: null,
  seatId: null,
  client: null,
  resuming: false,
  message: null,
  notice: null,
};

const noSubscription = () => () => {};
const offlineState = () => OFFLINE_STATE;

/** The online session's state, as React state. */
export function useOnlineSession(): SessionState {
  return useSyncExternalStore(
    onlineSession ? onlineSession.subscribe : noSubscription,
    onlineSession ? onlineSession.getState : offlineState,
  );
}
