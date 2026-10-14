import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { randomSeed } from '@pirate/game-core/config/seed';
import { applyAction, startRun } from '@pirate/run-core/run/engine';
import { parseRun, serializeRun } from '@pirate/run-core/run/save';
import type { RunAction, RunEvent, RunState } from '@pirate/run-core/run/types';

/** Where the saved run lives. The number is the save version; a new one starts a fresh key. */
export const RUN_STORAGE_KEY = 'pirate:run:v1';

/** The little of `localStorage` the run needs, so tests can stand in for it. */
export interface RunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): RunStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Storage can be unavailable (private mode); the run then lasts until the page closes.
    return null;
  }
}

export interface RunStoreState {
  /** The voyage in progress (or just ended), or none. */
  readonly run: RunState | null;
  /** What happened in the last step, for the screens to tell the player about. */
  readonly events: readonly RunEvent[];
  /** Begins a new voyage, replacing any saved one. */
  start(seed?: number): void;
  /** Applies a step of the voyage and saves it. Returns false if the rules refused it. */
  apply(action: RunAction): boolean;
  /** Forgets what happened last (the player has read it). */
  clearEvents(): void;
  /** Throws the voyage away, saved copy and all. */
  discard(): void;
}

/**
 * The solo voyage as the screens see it. Every change goes through the pure
 * rules in `run-core` and is saved straight away, so a refresh picks the voyage
 * up where it was. A save that cannot be read is ignored, not trusted.
 */
export function createRunStore(storage: RunStorage | null = browserStorage()): StoreApi<RunStoreState> {
  const save = (run: RunState | null) => {
    try {
      if (run === null) {
        storage?.removeItem(RUN_STORAGE_KEY);
      } else {
        storage?.setItem(RUN_STORAGE_KEY, serializeRun(run));
      }
    } catch {
      // Not being able to save is not worth stopping the voyage for.
    }
  };

  let saved: RunState | null = null;
  try {
    saved = parseRun(storage?.getItem(RUN_STORAGE_KEY) ?? null);
  } catch {
    saved = null;
  }

  return createStore<RunStoreState>((set, get) => ({
    run: saved,
    events: [],
    start: (seed = randomSeed()) => {
      const run = startRun(seed);
      save(run);
      set({ run, events: [] });
    },
    apply: (action) => {
      const current = get().run;
      if (!current) {
        return false;
      }
      const step = applyAction(current, action);
      if (!step.ok) {
        return false;
      }
      save(step.state);
      set({ run: step.state, events: step.events });
      return true;
    },
    clearEvents: () => set({ events: [] }),
    discard: () => {
      save(null);
      set({ run: null, events: [] });
    },
  }));
}

/** The one store the app uses. */
export const runStore = createRunStore();

export function useRun<T>(selector: (state: RunStoreState) => T): T {
  return useStore(runStore, selector);
}
