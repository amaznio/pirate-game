import { describe, expect, it } from 'vitest';
import { availableMoves } from '@pirate/run-core/run/engine';
import { RUN_STORAGE_KEY, createRunStore, type RunStorage } from '../runStore';

function memoryStorage(initial: Record<string, string> = {}): RunStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe('the run store', () => {
  it('starts with no voyage', () => {
    expect(createRunStore(memoryStorage()).getState().run).toBeNull();
    expect(createRunStore(null).getState().run).toBeNull();
  });

  it('starts a voyage, saves it, and a new store picks it up again', () => {
    const storage = memoryStorage();
    const store = createRunStore(storage);
    store.getState().start(1234);
    const run = store.getState().run!;
    expect(run.seed).toBe(1234);
    expect(run.phase).toBe('port');
    expect(storage.data[RUN_STORAGE_KEY]).toBeDefined();

    expect(createRunStore(storage).getState().run).toEqual(JSON.parse(JSON.stringify(run)));
  });

  it('applies steps through the rules, saves each, and keeps what happened', () => {
    const storage = memoryStorage();
    const store = createRunStore(storage);
    store.getState().start(99);
    // The first port sells a hull upgrade for exactly what the ship starts with.
    expect(store.getState().run!.offer).toContain('reinforceHull');
    expect(store.getState().apply({ type: 'buyUpgrade', upgrade: 'reinforceHull' })).toBe(true);
    expect(store.getState().events[0]).toMatchObject({ type: 'upgraded', upgrade: 'reinforceHull' });
    expect(store.getState().run!.phase).toBe('port');
    expect(store.getState().apply({ type: 'leavePort' })).toBe(true);
    expect(store.getState().run!.phase).toBe('map');

    const next = availableMoves(store.getState().run!)[0]!;
    expect(store.getState().apply({ type: 'travel', to: next.id })).toBe(true);
    expect(store.getState().run!.nodeId).toBe(next.id);
    expect(createRunStore(storage).getState().run!.nodeId).toBe(next.id);

    store.getState().clearEvents();
    expect(store.getState().events).toEqual([]);
  });

  it('refuses a step the rules refuse and changes nothing', () => {
    const store = createRunStore(memoryStorage());
    expect(store.getState().apply({ type: 'abandon' })).toBe(false);
    store.getState().start(5);
    const before = store.getState().run;
    expect(store.getState().apply({ type: 'travel', to: 'nowhere' })).toBe(false);
    expect(store.getState().run).toBe(before);
  });

  it('counts a voyage left in the middle of a fight as lost when it is loaded again', () => {
    const storage = memoryStorage();
    const store = createRunStore(storage);
    store.getState().start(5);
    // Sail to the first fight and begin it.
    store.getState().apply({ type: 'leavePort' });
    for (let guard = 0; guard < 40 && store.getState().run!.phase !== 'battle'; guard += 1) {
      store.getState().apply({ type: 'travel', to: availableMoves(store.getState().run!)[0]!.id });
      if (store.getState().run!.phase === 'port') {
        store.getState().apply({ type: 'leavePort' });
      }
    }
    expect(store.getState().run!.phase).toBe('battle');

    // Loaded before the fight began: the fight is still there to play.
    expect(createRunStore(storage).getState().run!.phase).toBe('battle');

    expect(store.getState().apply({ type: 'startBattle' })).toBe(true);
    const reloaded = createRunStore(storage).getState().run!;
    expect(reloaded.phase).toBe('defeat');
    expect(reloaded.defeatReason).toBe('sunk');
    // And that is saved, so loading again gives the same answer.
    expect(createRunStore(storage).getState().run!.phase).toBe('defeat');
  });

  it('keeps a finished voyage until it is thrown away', () => {
    const storage = memoryStorage();
    const store = createRunStore(storage);
    store.getState().start(5);
    expect(store.getState().apply({ type: 'abandon' })).toBe(true);
    expect(store.getState().run!.phase).toBe('defeat');
    expect(createRunStore(storage).getState().run!.phase).toBe('defeat');
    store.getState().discard();
    expect(store.getState().run).toBeNull();
    expect(storage.data[RUN_STORAGE_KEY]).toBeUndefined();
    expect(createRunStore(storage).getState().run).toBeNull();
  });

  it('ignores a save it cannot read, and survives storage that throws', () => {
    expect(createRunStore(memoryStorage({ [RUN_STORAGE_KEY]: 'garbage' })).getState().run).toBeNull();
    expect(createRunStore(memoryStorage({ [RUN_STORAGE_KEY]: '{"version":99}' })).getState().run).toBeNull();
    const angry: RunStorage = {
      getItem: () => {
        throw new Error('no storage');
      },
      setItem: () => {
        throw new Error('no storage');
      },
      removeItem: () => {
        throw new Error('no storage');
      },
    };
    const store = createRunStore(angry);
    expect(store.getState().run).toBeNull();
    store.getState().start(8);
    expect(store.getState().run).not.toBeNull();
    expect(store.getState().apply({ type: 'abandon' })).toBe(true);
    store.getState().discard();
    expect(store.getState().run).toBeNull();
  });
});
