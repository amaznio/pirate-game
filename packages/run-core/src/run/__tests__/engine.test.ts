import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { AREAS } from '../../config/areas';
import { generateArea } from '../../graph/generateArea';
import { nodeById } from '../../graph/query';
import { applyAction, availableMoves, startRun } from '../engine';
import { graphFor } from '../battle';
import {
  BATTLE_REWARD,
  HULL_LEVEL_CAP,
  HUNT_BOSS_BONUS,
  LANDFALL_REPAIR,
  PORT_REPAIR,
  START_PLUNDER,
  TREASURE_PER_PLUNDER,
  UPGRADE_PRICE,
  classForHullLevel,
  maxHullFor,
} from '../rules';
import { UPGRADE_IDS, type RunState } from '../types';
import { losingResult, playWithWins, step, winningResult } from './helpers';

const SEED = 20261014;

/** A run state moved to a given node, for tests of one rule at a time. */
function at(state: RunState, nodeId: string, patch: Partial<RunState> = {}): RunState {
  return { ...state, nodeId, ...patch };
}

describe('startRun', () => {
  it('starts a full Sloop at the landfall shop, with a little plunder', () => {
    const run = startRun(SEED);
    const graph = graphFor(run);
    expect(run.nodeId).toBe(graph.startId);
    expect(run.phase).toBe('port');
    expect(run.offer).toHaveLength(3);
    expect(run.hullLevel).toBe(0);
    expect(classForHullLevel(run.hullLevel).id).toBe('sloop');
    expect(run.hull).toBe(maxHullFor(0));
    expect(run.plunder).toBe(START_PLUNDER);
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
  it('is a shop: it must be left to sail, and sells only what is on offer and affordable', () => {
    const run: RunState = { ...startRun(SEED), offer: ['reinforceHull', 'addCannon'] };
    const refused = applyAction(run, { type: 'travel', to: availableMoves({ ...run, phase: 'map' })[0]!.id });
    expect(refused.ok).toBe(false);

    const notOffered = UPGRADE_IDS.find((id) => !run.offer!.includes(id))!;
    expect(applyAction(run, { type: 'buyUpgrade', upgrade: notOffered }).ok).toBe(false);
    // Offered but dearer than the ship has plunder for.
    expect(UPGRADE_PRICE.addCannon).toBeGreaterThan(run.plunder);
    expect(applyAction(run, { type: 'buyUpgrade', upgrade: 'addCannon' }).ok).toBe(false);

    const bought = step(run, { type: 'buyUpgrade', upgrade: 'reinforceHull' });
    expect(bought.state.phase).toBe('port');
    expect(bought.state.plunder).toBe(run.plunder - UPGRADE_PRICE.reinforceHull);
    expect(bought.state.offer).toEqual(['addCannon']);
    expect(bought.state.upgrades).toEqual(['reinforceHull']);
    expect(bought.events[0]).toMatchObject({ type: 'upgraded', upgrade: 'reinforceHull', price: UPGRADE_PRICE.reinforceHull });
    expect(applyAction(bought.state, { type: 'buyUpgrade', upgrade: 'reinforceHull' }).ok).toBe(false);

    const left = step(bought.state, { type: 'leavePort' });
    expect(left.state.phase).toBe('map');
    expect(left.state.offer).toBeUndefined();
    expect(applyAction(left.state, { type: 'leavePort' }).ok).toBe(false);
  });

  it('can be left with nothing bought', () => {
    const left = step(startRun(SEED), { type: 'leavePort' });
    expect(left.state.phase).toBe('map');
    expect(left.state.plunder).toBe(START_PLUNDER);
    expect(left.state.upgrades).toEqual([]);
  });

  it('will not sell an upgrade that would do nothing', () => {
    const run: RunState = { ...startRun(SEED), offer: ['repair'] };
    expect(run.hull).toBe(maxHullFor(0));
    expect(applyAction(run, { type: 'buyUpgrade', upgrade: 'repair' }).ok).toBe(false);
  });
});

describe('travel', () => {
  const free = (run: RunState) => step(run, { type: 'leavePort' }).state;

  it('only sails along a leg, and the plunder stays in the hold', () => {
    const run = free(startRun(SEED));
    const moves = availableMoves(run);
    expect(moves.length).toBeGreaterThan(0);
    expect(applyAction(run, { type: 'travel', to: 'nowhere' }).ok).toBe(false);
    expect(applyAction(run, { type: 'travel', to: graphFor(run).bossId }).ok).toBe(false);

    const to = moves[0]!;
    const sailed = step(run, { type: 'travel', to: to.id });
    expect(sailed.state.nodeId).toBe(to.id);
    expect(sailed.state.plunder).toBe(run.plunder);
    expect(sailed.state.legs).toBe(1);
    expect(sailed.events[0]).toEqual({ type: 'travelled', to: to.id });
  });
});

describe('the path through an area', () => {
  it('records each stop, starting at the landfall, and starts again in the next area', () => {
    const policy = (state: RunState) => state.offer![0]!;
    const seen = playWithWins(startRun(SEED), policy);
    expect(seen[0]!.path).toEqual([seen[0]!.nodeId]);
    for (let i = 1; i < seen.length; i += 1) {
      const before = seen[i - 1]!;
      const now = seen[i]!;
      expect(now.path[now.path.length - 1]).toBe(now.nodeId);
      if (now.areaIndex !== before.areaIndex) {
        expect(now.path).toEqual([now.nodeId]);
      } else if (now.nodeId !== before.nodeId) {
        expect(now.path).toEqual([...before.path, now.nodeId]);
      }
    }
    const lastOfFirstArea = seen.filter((s) => s.areaIndex === 0).pop()!;
    const graph = graphFor(lastOfFirstArea);
    expect(lastOfFirstArea.path[0]).toBe(graph.startId);
    expect(lastOfFirstArea.path[lastOfFirstArea.path.length - 1]).toBe(graph.bossId);
    expect(lastOfFirstArea.path.length).toBe(graph.layers);
  });
});

describe('starting a battle', () => {
  const inBattle = (): RunState => ({ ...startRun(SEED), phase: 'battle', offer: undefined });

  it('marks the fight as begun, once, and only at a fight', () => {
    expect(applyAction(startRun(SEED), { type: 'startBattle' }).ok).toBe(false);
    const begun = step(inBattle(), { type: 'startBattle' });
    expect(begun.state.battleStarted).toBe(true);
    expect(begun.state.phase).toBe('battle');
    expect(applyAction(begun.state, { type: 'startBattle' }).ok).toBe(false);
  });

  it('is cleared when the fight ends, whichever way', () => {
    const begun = step(inBattle(), { type: 'startBattle' }).state;
    const won = step(begun, { type: 'finishBattle', result: winningResult(begun) }).state;
    expect(won.battleStarted).toBeUndefined();
    expect(step(begun, { type: 'finishBattle', result: losingResult(begun) }).state.battleStarted).toBeUndefined();
    expect(step(begun, { type: 'loseBattle' }).state.battleStarted).toBeUndefined();
  });
});

describe('leaving a battle after being sunk', () => {
  it('ends the run as sunk, but only from a battle', () => {
    const run = startRun(SEED);
    expect(applyAction(run, { type: 'loseBattle' }).ok).toBe(false);
    const inBattle: RunState = { ...run, phase: 'battle', offer: undefined };
    const lost = step(inBattle, { type: 'loseBattle' });
    expect(lost.state.phase).toBe('defeat');
    expect(lost.state.defeatReason).toBe('sunk');
    expect(lost.events).toEqual([{ type: 'defeat', reason: 'sunk' }]);
  });
});

describe('ports', () => {
  /** A middle port of area 0, reached on its own. */
  function ports(seed = SEED) {
    const run = step(startRun(seed), { type: 'leavePort' }).state;
    const graph = graphFor(run);
    return { run, port: graph.nodes.find((n) => n.kind === 'port' && !n.landfall && n.layer < graph.layers - 2)! };
  }

  it('repairs, refills and puts upgrades up for sale on arrival', () => {
    const { run, port } = ports();
    const predecessor = graphFor(run).edges.find((e) => e.to === port.id)!.from;
    const hurt: RunState = at(run, predecessor, {
      phase: 'map',
      hull: 1,
      plunder: 5,
      ammo: 0,
      offer: undefined,
    });
    const sailed = step(hurt, { type: 'travel', to: port.id });
    expect(sailed.state.phase).toBe('port');
    expect(sailed.state.offer!.length).toBeGreaterThan(0);
    expect(sailed.state.hull).toBe(1 + PORT_REPAIR);
    expect(sailed.state.plunder).toBe(5);
    expect(sailed.state.ammo).toBeGreaterThan(0);
    expect(sailed.events.find((e) => e.type === 'portArrival')).toMatchObject({ landfall: false });
  });

  it('never overfills the hull', () => {
    const { run, port } = ports();
    const predecessor = graphFor(run).edges.find((e) => e.to === port.id)!.from;
    const full: RunState = at(run, predecessor, { phase: 'map', offer: undefined });
    const sailed = step(full, { type: 'travel', to: port.id });
    expect(sailed.state.hull).toBeLessThanOrEqual(maxHullFor(0));
  });

  it('does more at a landfall', () => {
    expect(LANDFALL_REPAIR).toBeGreaterThan(PORT_REPAIR);
  });
});

describe('upgrades through the run', () => {
  it('reinforcing the hull steps the ship up the classes', () => {
    let run: RunState = { ...startRun(SEED), phase: 'port', offer: ['reinforceHull'], plunder: 1000 };
    const classes: string[] = [];
    const refits: Array<{ from: string; to: string }> = [];
    for (let level = 1; level <= HULL_LEVEL_CAP; level += 1) {
      const taken = step({ ...run, phase: 'port', offer: ['reinforceHull'] }, { type: 'buyUpgrade', upgrade: 'reinforceHull' });
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
    const run: RunState = { ...startRun(SEED), phase: 'port', hull: 2, offer: ['reinforceHull'], plunder: 100 };
    const taken = step(run, { type: 'buyUpgrade', upgrade: 'reinforceHull' }).state;
    expect(taken.hull).toBe(3);
    expect(taken.hullLevel).toBe(1);
    expect(taken.plunder).toBe(100 - UPGRADE_PRICE.reinforceHull);
  });

  it('charges each upgrade its own price', () => {
    for (const upgrade of UPGRADE_IDS) {
      const run: RunState = { ...startRun(SEED), phase: 'port', hull: 2, offer: [upgrade], plunder: 100 };
      expect(step(run, { type: 'buyUpgrade', upgrade }).state.plunder).toBe(100 - UPGRADE_PRICE[upgrade]);
      expect(applyAction({ ...run, plunder: UPGRADE_PRICE[upgrade] - 1 }, { type: 'buyUpgrade', upgrade }).ok).toBe(false);
    }
    expect(new Set(UPGRADE_IDS.map((id) => UPGRADE_PRICE[id])).size).toBeGreaterThan(3);
  });
});

describe('finishing a battle', () => {
  /** The ship at the first battle node of area 0. */
  function atBattle(): RunState {
    let run = startRun(SEED);
    run = step(run, { type: 'leavePort' }).state;
    for (let guard = 0; guard < 50 && run.phase === 'map'; guard += 1) {
      const next = availableMoves(run).find((n) => n.kind !== 'port') ?? availableMoves(run)[0]!;
      run = step(run, { type: 'travel', to: next.id }).state;
      if (run.phase === 'port') {
        run = step(run, { type: 'leavePort' }).state;
      }
    }
    expect(run.phase).toBe('battle');
    return run;
  }

  it('carries hull and ammo out of a won fight and pays plunder', () => {
    const run = atBattle();
    const node = nodeById(graphFor(run), run.nodeId);
    const kind = node.kind === 'boss' ? 'boss' : node.battle!;
    const done = step(run, { type: 'finishBattle', result: winningResult({ ...run, hull: run.hull }, 1, 1) });
    expect(done.state.phase).toBe('map');
    expect(done.state.hull).toBe(Math.max(1, run.hull - 1));
    expect(done.state.ammo).toBe(Math.max(0, run.ammo - 1));
    expect(done.state.battlesWon).toBe(1);
    expect(done.state.plunder).toBe(run.plunder + BATTLE_REWARD[kind]);
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
        expect(state.plunder).toBeGreaterThanOrEqual(0);
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

describe('finishing a hunt', () => {
  const atHunt = (patch: Partial<RunState> = {}): RunState => {
    for (let seed = 1; seed < 100; seed += 1) {
      const graph = generateArea(seed, 2);
      const node = graph.nodes.find((n) => n.kind === 'hunt');
      if (node) {
        return { ...startRun(seed), areaIndex: 2, nodeId: node.id, phase: 'battle', offer: undefined, plunder: 0, ...patch };
      }
    }
    throw new Error('No hunt node found');
  };
  const left = (state: RunState, haul: number, bossSlain = false, hull = 3): MatchResult => {
    const won = winningResult(state);
    return {
      ...won,
      hunt: { ending: 'left', bossSlain, monstersSunk: 2, haul },
      ships: won.ships.map((ship) => ({ ...ship, hull, afloat: false, escaped: true })),
    };
  };

  it('pays plunder for the treasure banked, and brings the hull the hero left with', () => {
    const state = atHunt({ hullLevel: 3, hull: 6 });
    const after = step(state, { type: 'finishBattle', result: left(state, 12, false, 4) });
    expect(after.state.phase).toBe('map');
    expect(after.state.hull).toBe(4);
    expect(after.state.plunder).toBe(BATTLE_REWARD.hunt + Math.floor(12 / TREASURE_PER_PLUNDER));
    expect(after.events).toContainEqual(
      expect.objectContaining({ type: 'battleWon', kind: 'hunt', haul: 12, bossSlain: false }),
    );
  });

  it('pays a bonus for the Kraken, and a left hunt with nothing still pays the base', () => {
    const state = atHunt({ hullLevel: 3, hull: 6 });
    const slain = step(state, { type: 'finishBattle', result: left(state, 0, true) });
    expect(slain.state.plunder).toBe(BATTLE_REWARD.hunt + HUNT_BOSS_BONUS);
    const empty = step(state, { type: 'finishBattle', result: left(state, 0) });
    expect(empty.state.plunder).toBe(BATTLE_REWARD.hunt);
  });

  it('is lost, like any battle, when the hero is sunk', () => {
    const state = atHunt();
    const sunk: MatchResult = {
      ...losingResult(state),
      hunt: { ending: 'sunk', bossSlain: false, monstersSunk: 0, haul: 0 },
    };
    const after = step(state, { type: 'finishBattle', result: sunk });
    expect(after.state).toMatchObject({ phase: 'defeat', defeatReason: 'sunk' });
  });

  it('is not won by simply being afloat when the match ended some other way', () => {
    const state = atHunt();
    const made = winningResult(state);
    // A hero afloat and no word of leaving: that is not a way out of a hunt.
    const afloat: MatchResult = { outcome: made.outcome, turns: made.turns, ships: made.ships.map((s) => ({ ...s, afloat: true, escaped: false })) };
    const after = step(state, { type: 'finishBattle', result: afloat });
    expect(after.state.phase).toBe('defeat');
  });
});
