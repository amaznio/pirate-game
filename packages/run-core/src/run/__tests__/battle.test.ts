import { describe, expect, it } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { DEFAULT_OBJECTIVES } from '@pirate/game-core/domain/Objective';
import { runMatch } from '@pirate/game-core/testing/matchRunner';
import { buildMatchResult } from '@pirate/game-core/simulation/matchResult';
import { AREAS } from '../../config/areas';
import { generateArea } from '../../graph/generateArea';
import type { BattleKind, RouteGraph } from '../../graph/types';
import { buildBattle, bossFleetFor, depthOf, fleetFor, graphFor } from '../battle';
import { applyAction, startRun } from '../engine';
import { maxHullFor } from '../rules';
import type { RunState } from '../types';
import { step } from './helpers';

const SEED = 4711;

/** A run state standing at a given node of an area, ready for its battle. */
function standingAt(areaIndex: number, nodeId: string, patch: Partial<RunState> = {}): RunState {
  return {
    ...startRun(SEED),
    areaIndex,
    nodeId,
    phase: 'battle',
    offer: undefined,
    ...patch,
  };
}

function battleNodes(graph: RouteGraph, kind: BattleKind) {
  return graph.nodes.filter((node) => node.kind === 'battle' && node.battle === kind);
}

/** Looks through seeds for a map with a battle node of this kind, so a test never skips. */
function findBattle(kind: BattleKind, areaIndex: number) {
  for (let seed = 1; seed < 400; seed += 1) {
    const node = battleNodes(generateArea(seed, areaIndex), kind)[0];
    if (node) {
      return { seed, node };
    }
  }
  throw new Error(`No ${kind} node found in area ${areaIndex}`);
}

describe('buildBattle', () => {
  it('refuses when the ship is not at a fight', () => {
    expect(() => buildBattle(startRun(SEED))).toThrow(/no battle/);
  });

  it('builds a match the game can start, for every kind of battle node in every area', () => {
    for (let areaIndex = 0; areaIndex < AREAS.length; areaIndex += 1) {
      const graph = generateArea(SEED + areaIndex, areaIndex);
      const fights = graph.nodes.filter((node) => node.kind !== 'port');
      const seenKinds = new Set<string>();
      for (const node of fights) {
        const key = node.kind === 'boss' ? 'boss' : node.battle!;
        if (seenKinds.has(key)) {
          continue;
        }
        seenKinds.add(key);
        const state = standingAt(areaIndex, node.id, { seed: SEED + areaIndex });
        const setup = buildBattle(state);
        expect(setup.kind).toBe(key);
        const game = createGame(setup.config);
        const heroShip = Object.values(game.ships).find((ship) => ship.ownerId === setup.heroPlayerId)!;
        expect(heroShip.hp).toBeGreaterThan(0);
        expect(game.players[setup.heroPlayerId]!.controller).toBe('human');
      }
      expect(seenKinds.has('boss')).toBe(true);
    }
  });

  it('is the same every time it is asked for', () => {
    const graph = generateArea(SEED, 0);
    const node = battleNodes(graph, 'standard')[0]!;
    const state = standingAt(0, node.id);
    expect(buildBattle(state)).toEqual(buildBattle(state));
    expect(buildBattle(state).config.seed).not.toBe(buildBattle(standingAt(0, battleNodes(graph, 'standard')[1]?.id ?? node.id, { seed: SEED + 1 })).config.seed);
  });

  it('sets the hero up from the run: class, hull, cannonballs and damage', () => {
    const graph = generateArea(SEED, 0);
    const node = battleNodes(graph, 'standard')[0]!;
    const state = standingAt(0, node.id, { hullLevel: 2, hull: 3, ammo: 2, cannonDamage: 2 });
    const setup = buildBattle(state);
    const game = createGame(setup.config);
    const ship = Object.values(game.ships).find((s) => s.ownerId === setup.heroPlayerId)!;
    expect(setup.config.participants.find((p) => p.playerId === setup.heroPlayerId)!.shipTypeId).toBe('brigantine');
    expect(ship.hp).toBe(3);
    expect(game.players[setup.heroPlayerId]!.ammo).toBe(2);
    expect(ship.bonusDamage).toBe(2);
  });

  it('puts the whole enemy fleet on one side, against the hero', () => {
    const graph = generateArea(SEED, 3);
    const node = battleNodes(graph, 'standard')[0] ?? battleNodes(graph, 'survive')[0]!;
    const setup = buildBattle(standingAt(3, node.id, { seed: SEED }));
    const ais = setup.config.participants.filter((p) => p.controller === 'ai');
    expect(ais.length).toBeGreaterThan(1);
    expect(new Set(ais.map((p) => p.teamId)).size).toBe(1);
    expect(ais[0]!.teamId).not.toBe(setup.config.participants.find((p) => p.controller === 'human')!.teamId);
  });

  it('gives an ambush the objective, the raiders and the hero its veteran guns on top of its own damage', () => {
    const { seed, node } = findBattle('ambush', 1);
    const setup = buildBattle(standingAt(1, node.id, { seed, cannonDamage: 1 }));
    expect(setup.config.objective?.kind).toBe('ambush');
    const game = createGame(setup.config);
    const ship = Object.values(game.ships).find((s) => s.ownerId === setup.heroPlayerId)!;
    expect(ship.bonusDamage).toBe(2);
  });

  it('adds a merchant and escorts for a merchant battle', () => {
    const { seed, node } = findBattle('merchant', 0);
    const setup = buildBattle(standingAt(0, node.id, { seed }));
    expect(setup.config.objective).toMatchObject({ kind: 'merchant', turns: DEFAULT_OBJECTIVES.merchant.kind === 'merchant' ? DEFAULT_OBJECTIVES.merchant.turns : 0 });
    expect(setup.config.participants.some((p) => p.playerId === 'merchant')).toBe(true);
  });

  it('puts a Galleon flagship at the head of a boss fleet', () => {
    const graph = generateArea(SEED, 2);
    const setup = buildBattle(standingAt(2, graph.bossId));
    expect(setup.kind).toBe('boss');
    const ais = setup.config.participants.filter((p) => p.controller === 'ai');
    expect(ais[0]!.shipTypeId).toBe('galleon');
    expect(ais[0]!.name).toBe('Flagship');
    expect(ais).toHaveLength(bossFleetFor(2).shipTypeIds.length);
    expect(setup.config.objective).toBeUndefined();
  });

  it('plays on the sea of the area', () => {
    for (const [areaIndex, spec] of AREAS.entries()) {
      const graph = generateArea(SEED, areaIndex);
      const setup = buildBattle(standingAt(areaIndex, graph.bossId));
      expect(setup.config.sea).toBe(spec.sea);
    }
  });
});

describe('the enemy gets harder as the run goes on', () => {
  it('has bigger, more and cleverer ships later', () => {
    const early = fleetFor(0.05);
    const late = fleetFor(0.9);
    expect(late.shipTypeIds.length).toBeGreaterThan(early.shipTypeIds.length);
    expect(early.shipTypeIds[0]).toBe('sloop');
    expect(late.shipTypeIds[0]).toBe('galleon');
    expect(early.aiDifficulty).toBe('easy');
    expect(late.aiDifficulty).toBe('hard');
  });

  it('measures depth from 0 to 1 over the whole run', () => {
    const first = startRun(SEED);
    const graph0 = graphFor(first);
    expect(depthOf(first, graph0, graph0.nodes[0]!)).toBe(0);
    const last = { ...first, areaIndex: AREAS.length - 1 };
    const graphN = graphFor(last);
    const boss = graphN.nodes.find((n) => n.id === graphN.bossId)!;
    expect(depthOf(last, graphN, boss)).toBe(1);
    const mid = graphN.nodes[Math.floor(graphN.nodes.length / 2)]!;
    expect(depthOf(last, graphN, mid)).toBeLessThan(1);
    expect(depthOf(last, graphN, mid)).toBeGreaterThan(0.8);
  });

  it('keeps the boss fleet growing across areas', () => {
    expect(bossFleetFor(0).shipTypeIds.length).toBeLessThan(bossFleetFor(2).shipTypeIds.length);
    expect(bossFleetFor(0).aiDifficulty).toBe('normal');
    expect(bossFleetFor(4).aiDifficulty).toBe('hard');
  });
});

describe('real battles feed the run', () => {
  /** Plays a battle with the AI sailing every ship and reads the result. */
  function fight(state: RunState) {
    const setup = buildBattle(state);
    const record = runMatch(setup.config);
    return buildMatchResult(record.finalState);
  }

  it('turns a played match into a map move or the end of the run', () => {
    let finished = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      let run: RunState = startRun(seed);
      run = step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).state;
      // Sail to the first fight.
      for (let guard = 0; guard < 30 && run.phase !== 'battle'; guard += 1) {
        const graph = graphFor(run);
        const edge = graph.edges.find((e) => e.from === run.nodeId)!;
        run = step(run, { type: 'travel', to: edge.to }).state;
        if (run.phase === 'port') {
          run = step(run, { type: 'chooseUpgrade', upgrade: run.offer![0]! }).state;
        }
      }
      expect(run.phase).toBe('battle');
      const result = fight(run);
      if (!result) {
        continue;
      }
      finished += 1;
      const after = applyAction(run, { type: 'finishBattle', result });
      expect(after.ok).toBe(true);
      if (after.ok) {
        expect(['map', 'defeat']).toContain(after.state.phase);
        if (after.state.phase === 'map') {
          expect(after.state.hull).toBeGreaterThanOrEqual(1);
          expect(after.state.hull).toBeLessThanOrEqual(maxHullFor(after.state.hullLevel));
          expect(after.state.battlesWon).toBe(1);
        }
      }
    }
    expect(finished).toBeGreaterThan(0);
  });
});
