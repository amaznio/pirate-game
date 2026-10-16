import { describe, expect, it } from 'vitest';
import { availableMoves, startRun } from '../engine';
import { parseRun, serializeRun } from '../save';
import { CANNON_DAMAGE_CAP } from '../rules';
import type { RunState } from '../types';
import { playWithWins, step } from './helpers';

const policy = (state: RunState) => state.offer![0]!;

describe('saving a run', () => {
  it('reads back exactly what was saved, at every point of a whole run', () => {
    const seen = playWithWins(startRun(31337), policy);
    expect(seen.length).toBeGreaterThan(100);
    for (const state of seen) {
      expect(parseRun(serializeRun(state))).toEqual(JSON.parse(JSON.stringify(state)));
    }
  });

  it('can carry on playing after a load', () => {
    const run = step(startRun(5), { type: 'leavePort' }).state;
    const loaded = parseRun(serializeRun(run))!;
    const move = availableMoves(loaded)[0]!;
    expect(step(loaded, { type: 'travel', to: move.id }).state.nodeId).toBe(move.id);
  });

  it('loads a save from when the damage cap was higher, at the cap now', () => {
    const old = { ...startRun(5), cannonDamage: CANNON_DAMAGE_CAP + 1 };
    expect(parseRun(serializeRun(old))!.cannonDamage).toBe(CANNON_DAMAGE_CAP);
    expect(parseRun(serializeRun({ ...old, cannonDamage: CANNON_DAMAGE_CAP + 2 }))).toBeNull();
  });

  it('keeps a finished run readable', () => {
    const over = step(startRun(5), { type: 'abandon' }).state;
    expect(parseRun(serializeRun(over))!.phase).toBe('defeat');
  });
});

describe('a save that cannot be trusted gives nothing', () => {
  const good = serializeRun(startRun(7));
  const tweak = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(good), ...patch });

  it('refuses empty, broken and wrong-shaped text', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('')).toBeNull();
    expect(parseRun('not json')).toBeNull();
    expect(parseRun('[]')).toBeNull();
    expect(parseRun('42')).toBeNull();
    expect(parseRun('{}')).toBeNull();
  });

  it('refuses an old version', () => {
    expect(parseRun(tweak({ version: 0 }))).toBeNull();
    expect(parseRun(tweak({ version: 1 }))).toBeNull();
    expect(parseRun(tweak({ version: 2 }))).toBeNull();
    expect(parseRun(tweak({ version: 3 }))).toBeNull();
  });

  it('refuses numbers outside what the engine can make', () => {
    expect(parseRun(tweak({ hull: 99 }))).toBeNull();
    expect(parseRun(tweak({ hull: 0 }))).toBeNull();
    expect(parseRun(tweak({ hullLevel: 9 }))).toBeNull();
    expect(parseRun(tweak({ plunder: 500000 }))).toBeNull();
    expect(parseRun(tweak({ plunder: -1 }))).toBeNull();
    expect(parseRun(tweak({ plunder: 2.5 }))).toBeNull();
    expect(parseRun(tweak({ cannonsPerSide: 4 }))).toBeNull();
    expect(parseRun(tweak({ cannonsPerSide: 0 }))).toBeNull();
    expect(parseRun(tweak({ ammo: 1.5 }))).toBeNull();
    expect(parseRun(tweak({ areaIndex: 5 }))).toBeNull();
    expect(parseRun(tweak({ areaCount: 9 }))).toBeNull();
    expect(parseRun(tweak({ seed: -3 }))).toBeNull();
  });

  it('refuses a stop that is not on the map, or a port with no shop', () => {
    expect(parseRun(tweak({ nodeId: 'a0:99:9' }))).toBeNull();
    expect(parseRun(tweak({ offer: null }))).toBeNull();
    // A port whose upgrades are all bought is still a port.
    expect(parseRun(tweak({ offer: [] }))).not.toBeNull();
    expect(parseRun(tweak({ offer: ['nonsense'] }))).toBeNull();
    expect(parseRun(tweak({ phase: 'weather' }))).toBeNull();
    expect(parseRun(tweak({ upgrades: ['nonsense'] }))).toBeNull();
  });

  it('refuses a path that is empty, off the map or does not end where the ship is', () => {
    expect(parseRun(tweak({ path: [] }))).toBeNull();
    expect(parseRun(tweak({ path: ['a0:99:9'] }))).toBeNull();
    expect(parseRun(tweak({ path: ['a0:1:0'] }))).toBeNull();
    expect(parseRun(tweak({ path: 'nope' }))).toBeNull();
    const without = JSON.parse(good);
    delete without.path;
    expect(parseRun(JSON.stringify(without))).toBeNull();
  });

  it('keeps the mark of a fight begun, and refuses it anywhere but in a fight', () => {
    const fight = JSON.parse(good);
    const inFight = { ...fight, phase: 'battle', offer: undefined, battleStarted: true, nodeId: fight.nodeId, path: fight.path };
    // The landfall is a port, so this is not a fight node: move to a battle stop first.
    expect(parseRun(JSON.stringify(inFight))).toBeNull();
    expect(parseRun(tweak({ battleStarted: true }))).toBeNull();
    expect(parseRun(tweak({ battleStarted: false }))).toBeNull();
    expect(parseRun(tweak({ battleStarted: 'yes' }))).toBeNull();
  });

  it('refuses a defeat with no reason', () => {
    expect(parseRun(tweak({ phase: 'defeat', hull: 0 }))).toBeNull();
    expect(parseRun(tweak({ phase: 'defeat', hull: 0, defeatReason: 'sunk', offer: undefined }))).not.toBeNull();
  });
});
