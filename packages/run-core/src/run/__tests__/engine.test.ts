import { describe, expect, it } from 'vitest';
import { AREAS } from '../../config/areas';
import { generateArea } from '../../graph/generateArea';
import { nodeById } from '../../graph/query';
import { applyAction, availableMoves, legCost, startRun } from '../engine';
import { graphFor } from '../battle';
import {
  BATTLE_REWARD,
  HULL_LEVEL_CAP,
  LANDFALL_REPAIR,
  PORT_REPAIR,
  PORT_SUPPLIES,
  cargoCapFor,
  classForHullLevel,
  maxHullFor,
  supplyUseFor,
} from '../rules';
import type { RunState } from '../types';
import { losingResult, playWithWins, step, winningResult } from './helpers';

const SEED = 20261014;

/** A run state moved to a given node, for tests of one rule at a time. */
function at(state: RunState, nodeId: string, patch: Partial<RunState> = {}): RunState {
  return { ...state, nodeId, ...patch };
}

describe('startRun', () => {
  it('starts a full Sloop at the landfall, with an upgrade to pick', () => {
    const run = startRun(SEED);
    const graph = graphFor(run);
    expect(run.nodeId).toBe(graph.startId);
    expect(run.phase).toBe('port');
    expect(run.offer).toHaveLength(3);
    expect(run.hullLevel).toBe(0);
    expect(classForHullLevel(run.hullLevel).id).toBe('sloop');
    expect(run.hull).toBe(maxHullFor(0));
    expect(run.supplies).toBe(cargoCapFor(0));
    expect(run.cannonsPerSide).toBe(1);
    expect(run.areaIndex).toBe(0);
    expect(run.areaCount).toBe(AREAS.length);
  });

  it('is the same for the same seed and differs for another', () => {
    expect(startRun(SEED)).toEqual(startRun(SEED));
    expect(startRun(SEED).offer).not.toEqual(undefined);
    expect(generateArea(SEED, 0)).not.toEqual(generateArea(SEED + 1, 0));
  });

  it('can be a short run of fewer areas', () => {
    expect(startRun(SEED, { areaCount: 2 }).areaCount).toBe(2);
    expect(startRun(SEED, { areaCount: 99 }).areaCount).toBe(AREAS.length);
    expect(startRun(SEED, { areaCount: 0 }).areaCount).toBe(1);
  });
});

describe('the port at the start', () => {
  it('must be left by picking one of the offered upgrades', () => {
    const run = startRun(SEED);
    const refused = applyAction(run, { type: 'travel', to: availableMoves({ ...run, phase: 'map' })[0]!.id });
    expect(refused.ok).toBe(false);

    const notOffered = (['reinforceHull', 'addCannon', 'cannonDamage', 'cannonballs', 'repair', 'provisions'] as const).find(
      (id) => !run.offer!.includes(id),
    )!;
    expect(applyAction(run, { type: 'chooseUpgrade', upgrade: notOffered }).ok).toBe(false);

    const picked = step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! });
    expect(picked.state.phase).toBe('map');
    expect(picked.state.offer).toBeUndefined();
    expect(picked.state.upgrades).toEqual([run.offer![0]]);
    expect(picked.events[0]).toMatchObject({ type: 'upgraded' });
    expect(applyAction(picked.state, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).ok).toBe(false);
  });
});

describe('travel', () => {
  const free = (run: RunState) => step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).state;

  it('only sails along a leg, and costs the class supply use', () => {
    const run = free(startRun(SEED));
    const moves = availableMoves(run);
    expect(moves.length).toBeGreaterThan(0);
    expect(applyAction(run, { type: 'travel', to: 'nowhere' }).ok).toBe(false);
    expect(applyAction(run, { type: 'travel', to: graphFor(run).bossId }).ok).toBe(false);

    const to = moves[0]!;
    expect(legCost(run, to.id)).toBe(supplyUseFor(run.hullLevel));
    const sailed = step(run, { type: 'travel', to: to.id });
    expect(sailed.state.nodeId).toBe(to.id);
    expect(sailed.state.supplies).toBe(run.supplies - supplyUseFor(0));
    expect(sailed.state.legs).toBe(1);
    expect(sailed.events[0]).toMatchObject({ type: 'travelled', suppliesSpent: supplyUseFor(0) });
  });

  it('a bigger class costs more per leg', () => {
    const run = free(startRun(SEED));
    for (const level of [0, 2, 4]) {
      const big = { ...run, hullLevel: level, hull: maxHullFor(level), supplies: cargoCapFor(level) };
      const to = availableMoves(big)[0]!;
      const sailed = step(big, { type: 'travel', to: to.id });
      expect(big.supplies - sailed.state.supplies).toBe(supplyUseFor(level));
    }
    expect(supplyUseFor(0)).toBeLessThan(supplyUseFor(2));
    expect(supplyUseFor(2)).toBeLessThan(supplyUseFor(4));
  });

  it('starves the hull, not the run, when the hold is empty', () => {
    const run = { ...free(startRun(SEED)), supplies: 0 };
    const sailed = step(run, { type: 'travel', to: availableMoves(run)[0]!.id });
    expect(sailed.state.supplies).toBe(0);
    expect(sailed.state.hull).toBe(run.hull - 1);
    expect(sailed.state.phase).not.toBe('defeat');
    expect(sailed.events.map((e) => e.type)).toContain('starved');
  });

  it('pays what it can and starves for the rest', () => {
    const base = { ...free(startRun(SEED)), hullLevel: 4, hull: 8, supplies: 1 };
    const sailed = step(base, { type: 'travel', to: availableMoves(base)[0]!.id });
    expect(sailed.state.supplies).toBe(0);
    expect(sailed.state.hull).toBe(7);
  });

  it('ends the run when starvation sinks the ship', () => {
    const run = { ...free(startRun(SEED)), supplies: 0, hull: 1 };
    const sailed = step(run, { type: 'travel', to: availableMoves(run)[0]!.id });
    expect(sailed.state.phase).toBe('defeat');
    expect(sailed.state.defeatReason).toBe('starved');
    expect(sailed.state.hull).toBe(0);
    expect(applyAction(sailed.state, { type: 'abandon' }).ok).toBe(false);
  });
});

describe('ports', () => {
  /** A middle port of area 0, reached on its own. */
  function ports(seed = SEED) {
    const run = step(startRun(seed), { type: 'chooseUpgrade', upgrade: startRun(seed).offer![0]! }).state;
    const graph = graphFor(run);
    return { run, port: graph.nodes.find((n) => n.kind === 'port' && !n.landfall && n.layer < graph.layers - 2)! };
  }

  it('repairs, restocks and offers an upgrade on arrival', () => {
    const { run, port } = ports();
    const predecessor = graphFor(run).edges.find((e) => e.to === port.id)!.from;
    const hurt: RunState = at(run, predecessor, {
      phase: 'map',
      hull: 1,
      supplies: 1,
      ammo: 0,
      offer: undefined,
    });
    const sailed = step(hurt, { type: 'travel', to: port.id });
    expect(sailed.state.phase).toBe('port');
    expect(sailed.state.offer!.length).toBeGreaterThan(0);
    expect(sailed.state.hull).toBe(1 + PORT_REPAIR);
    expect(sailed.state.supplies).toBe(1 - Math.min(1, supplyUseFor(0)) + PORT_SUPPLIES);
    expect(sailed.state.ammo).toBeGreaterThan(0);
    expect(sailed.events.find((e) => e.type === 'portArrival')).toMatchObject({ landfall: false });
  });

  it('never overfills the hull or the hold', () => {
    const { run, port } = ports();
    const predecessor = graphFor(run).edges.find((e) => e.to === port.id)!.from;
    const full: RunState = at(run, predecessor, { phase: 'map', offer: undefined });
    const sailed = step(full, { type: 'travel', to: port.id });
    expect(sailed.state.hull).toBeLessThanOrEqual(maxHullFor(0));
    expect(sailed.state.supplies).toBeLessThanOrEqual(cargoCapFor(0));
  });

  it('does more at a landfall', () => {
    expect(LANDFALL_REPAIR).toBeGreaterThan(PORT_REPAIR);
  });
});

describe('upgrades through the run', () => {
  it('reinforcing the hull steps the ship up the classes', () => {
    let run: RunState = { ...startRun(SEED), phase: 'port', offer: ['reinforceHull'] };
    const classes: string[] = [];
    const refits: Array<{ from: string; to: string }> = [];
    for (let level = 1; level <= HULL_LEVEL_CAP; level += 1) {
      const taken = step({ ...run, phase: 'port', offer: ['reinforceHull'] }, { type: 'chooseUpgrade', upgrade: 'reinforceHull' });
      run = taken.state;
      classes.push(classForHullLevel(run.hullLevel).id);
      const event = taken.events[0]!;
      if (event.type === 'upgraded' && event.refit) {
        refits.push(event.refit);
      }
      expect(run.hullLevel).toBe(level);
      expect(maxHullFor(level)).toBe(4 + level);
    }
    expect(classes).toEqual(['sloop', 'brigantine', 'brigantine', 'galleon', 'galleon', 'galleon']);
    expect(refits).toEqual([
      { from: 'sloop', to: 'brigantine' },
      { from: 'brigantine', to: 'galleon' },
    ]);
  });

  it('adds one hull a level and mends it', () => {
    const run: RunState = { ...startRun(SEED), phase: 'port', hull: 2, offer: ['reinforceHull'] };
    const taken = step(run, { type: 'chooseUpgrade', upgrade: 'reinforceHull' }).state;
    expect(taken.hull).toBe(3);
    expect(taken.hullLevel).toBe(1);
  });
});

describe('finishing a battle', () => {
  /** The ship at the first battle node of area 0. */
  function atBattle(): RunState {
    let run = startRun(SEED);
    run = step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).state;
    for (let guard = 0; guard < 50 && run.phase === 'map'; guard += 1) {
      const next = availableMoves(run).find((n) => n.kind !== 'port') ?? availableMoves(run)[0]!;
      run = step(run, { type: 'travel', to: next.id }).state;
      if (run.phase === 'port') {
        run = step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).state;
      }
    }
    expect(run.phase).toBe('battle');
    return run;
  }

  it('carries hull and ammo out of a won fight and pays supplies', () => {
    const run = atBattle();
    const node = nodeById(graphFor(run), run.nodeId);
    const kind = node.kind === 'boss' ? 'boss' : node.battle!;
    const done = step(run, { type: 'finishBattle', result: winningResult({ ...run, hull: run.hull }, 1, 1) });
    expect(done.state.phase).toBe('map');
    expect(done.state.hull).toBe(Math.max(1, run.hull - 1));
    expect(done.state.ammo).toBe(Math.max(0, run.ammo - 1));
    expect(done.state.battlesWon).toBe(1);
    expect(done.state.supplies).toBe(Math.min(cargoCapFor(run.hullLevel), run.supplies + BATTLE_REWARD[kind]));
    expect(done.events[0]).toMatchObject({ type: 'battleWon', kind });
  });

  it('ends the run when the hero is sunk or the match is drawn', () => {
    const run = atBattle();
    const lost = step(run, { type: 'finishBattle', result: losingResult(run) });
    expect(lost.state.phase).toBe('defeat');
    expect(lost.state.defeatReason).toBe('sunk');

    const drawn = { ...winningResult(run), outcome: { kind: 'draw' as const } };
    expect(step(run, { type: 'finishBattle', result: drawn }).state.phase).toBe('defeat');
    const nobody = { ...winningResult(run), outcome: { kind: 'eliminated' as const } };
    expect(step(run, { type: 'finishBattle', result: nobody }).state.phase).toBe('defeat');
  });

  it('refuses a result when there is no battle', () => {
    const run = startRun(SEED);
    expect(applyAction(run, { type: 'finishBattle', result: winningResult(atBattle()) }).ok).toBe(false);
  });

  it('can be abandoned at any time', () => {
    const run = startRun(SEED);
    const gone = step(run, { type: 'abandon' });
    expect(gone.state.phase).toBe('defeat');
    expect(gone.state.defeatReason).toBe('abandoned');
  });
});

describe('a whole run', () => {
  const policy = (state: RunState) => state.offer!.find((id) => id === 'reinforceHull') ?? state.offer![0]!;

  it('reaches victory through every area when every battle is won', () => {
    for (const seed of [1, 77, 4242]) {
      const seen = playWithWins(startRun(seed), policy);
      const last = seen[seen.length - 1]!;
      expect(last.phase).toBe('victory');
      expect(last.areaIndex).toBe(AREAS.length - 1);
      expect(new Set(seen.map((s) => s.areaIndex))).toEqual(new Set(AREAS.map((_, i) => i)));
      for (const state of seen) {
        expect(state.hull).toBeGreaterThanOrEqual(0);
        expect(state.hull).toBeLessThanOrEqual(maxHullFor(state.hullLevel));
        expect(state.supplies).toBeGreaterThanOrEqual(0);
        expect(state.supplies).toBeLessThanOrEqual(cargoCapFor(state.hullLevel));
        expect(state.cannonsPerSide).toBeLessThanOrEqual(3);
      }
    }
  });

  it('moves to the next area landfall after each boss', () => {
    const seen = playWithWins(startRun(SEED), policy);
    for (let i = 1; i < seen.length; i += 1) {
      if (seen[i]!.areaIndex === seen[i - 1]!.areaIndex + 1) {
        const graph = graphFor(seen[i]!);
        expect(seen[i]!.nodeId).toBe(graph.startId);
        expect(seen[i]!.phase).toBe('port');
        expect(seen[i - 1]!.nodeId).toBe(graphFor(seen[i - 1]!).bossId);
      }
    }
  });

  it('is the same every time for the same seed and choices', () => {
    expect(playWithWins(startRun(SEED), policy)).toEqual(playWithWins(startRun(SEED), policy));
  });

  it('wins a short run of two areas', () => {
    const seen = playWithWins(startRun(SEED, { areaCount: 2 }), policy);
    expect(seen[seen.length - 1]!.phase).toBe('victory');
    expect(seen[seen.length - 1]!.areaIndex).toBe(1);
  });

  it('gives the player plenty of upgrades over a run', () => {
    const seen = playWithWins(startRun(SEED), policy);
    expect(seen[seen.length - 1]!.upgrades.length).toBeGreaterThanOrEqual(12);
  });
});
