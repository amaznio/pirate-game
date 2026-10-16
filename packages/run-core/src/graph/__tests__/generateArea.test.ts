import { describe, expect, it } from 'vitest';
import { AREAS, specProblem, type AreaSpec } from '../../config/areas';
import { generateArea, generateAreas, nodeId, portLayers } from '../generateArea';
import { nodeById, nodesInLayer, portNodes, predecessors, reachableFrom, successors } from '../query';
import { BATTLE_KINDS } from '../types';

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 13);

describe('generateArea: the same seed gives the same map', () => {
  it('builds an identical graph twice', () => {
    expect(generateArea(42, 0)).toEqual(generateArea(42, 0));
    expect(generateArea(42, 3)).toEqual(generateArea(42, 3));
  });

  it('builds different graphs for different seeds and different areas', () => {
    expect(generateArea(1, 2)).not.toEqual(generateArea(2, 2));
    expect(generateArea(1, 2).nodes.map((n) => n.id)).not.toEqual(
      generateArea(1, 3).nodes.map((n) => n.id),
    );
  });

  it('builds all areas of a run, in order', () => {
    const areas = generateAreas(99);
    expect(areas).toHaveLength(AREAS.length);
    areas.forEach((area, index) => expect(area.areaIndex).toBe(index));
  });
});

describe('generateArea: the shape of every area', () => {
  for (const [areaIndex, spec] of AREAS.entries()) {
    describe(`area ${areaIndex} (${spec.layers} layers)`, () => {
      for (const seed of SEEDS) {
        const graph = generateArea(seed, areaIndex);

        it(`seed ${seed}: starts at a landfall port and ends at one boss`, () => {
          const first = nodesInLayer(graph, 0);
          const last = nodesInLayer(graph, spec.layers - 1);
          expect(first).toHaveLength(1);
          expect(first[0]).toMatchObject({ kind: 'port', landfall: true });
          expect(graph.startId).toBe(first[0]!.id);
          expect(last).toHaveLength(1);
          expect(last[0]!.kind).toBe('boss');
          expect(graph.bossId).toBe(last[0]!.id);
          expect(graph.nodes.filter((n) => n.kind === 'boss')).toHaveLength(1);
          expect(graph.nodes.filter((n) => n.landfall)).toHaveLength(1);
        });

        it(`seed ${seed}: a single port sits right before the boss`, () => {
          const before = nodesInLayer(graph, spec.layers - 2);
          expect(before).toHaveLength(1);
          expect(before[0]!.kind).toBe('port');
        });

        it(`seed ${seed}: every node is reachable and leads on to the boss`, () => {
          const fromStart = reachableFrom(graph, graph.startId);
          expect(fromStart.size).toBe(graph.nodes.length);
          for (const node of graph.nodes) {
            expect(reachableFrom(graph, node.id).has(graph.bossId)).toBe(true);
          }
        });

        it(`seed ${seed}: legs only join neighbouring layers`, () => {
          for (const edge of graph.edges) {
            const from = nodeById(graph, edge.from);
            const to = nodeById(graph, edge.to);
            expect(to.layer).toBe(from.layer + 1);
            expect(edge.cost).toBeGreaterThan(0);
          }
          for (const node of graph.nodes) {
            if (node.id !== graph.bossId) {
              expect(successors(graph, node.id).length).toBeGreaterThan(0);
            }
            if (node.id !== graph.startId) {
              expect(predecessors(graph, node.id).length).toBeGreaterThan(0);
            }
          }
        });

        it(`seed ${seed}: legs do not cross`, () => {
          for (let layer = 0; layer < spec.layers - 1; layer += 1) {
            const legs = graph.edges
              .filter((edge) => nodeById(graph, edge.from).layer === layer)
              .map((edge) => [nodeById(graph, edge.from).index, nodeById(graph, edge.to).index] as const);
            for (const [i1, j1] of legs) {
              for (const [i2, j2] of legs) {
                if (i1 < i2) {
                  expect(j1).toBeLessThanOrEqual(j2);
                }
              }
            }
          }
        });

        it(`seed ${seed}: ports are on purpose, never in a row`, () => {
          const middle = portLayers(spec);
          expect(middle.size).toBeGreaterThan(0);
          for (const layer of middle) {
            expect(nodesInLayer(graph, layer).some((n) => n.kind === 'port')).toBe(true);
          }
          const portLayerList = [...new Set(portNodes(graph).map((n) => n.layer))].sort((a, b) => a - b);
          for (let i = 1; i < portLayerList.length; i += 1) {
            expect(portLayerList[i]! - portLayerList[i - 1]!).toBeGreaterThan(1);
          }
          expect(portNodes(graph).length).toBeGreaterThanOrEqual(middle.size + 2);
        });

        it(`seed ${seed}: battle nodes carry a battle kind and others do not`, () => {
          for (const node of graph.nodes) {
            if (node.kind === 'battle') {
              expect(BATTLE_KINDS).toContain(node.battle);
            } else {
              expect(node.battle).toBeUndefined();
            }
            expect(node.x).toBeGreaterThan(0);
            expect(node.x).toBeLessThan(1);
            expect(node.y).toBeGreaterThanOrEqual(0);
            expect(node.y).toBeLessThanOrEqual(1);
          }
          const ids = graph.nodes.map((n) => n.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(graph.nodes.map((n) => n.id)).toContain(nodeId(areaIndex, 0, 0));
        });
      }
    });
  }
});

describe('generateArea: the opening and the sea', () => {
  it('keeps the opening layers of the first area to ordinary fights', () => {
    for (const seed of SEEDS) {
      const graph = generateArea(seed, 0);
      for (let layer = 1; layer <= AREAS[0]!.openingStandardLayers; layer += 1) {
        for (const node of nodesInLayer(graph, layer)) {
          expect(node.battle).toBe('standard');
        }
      }
    }
  });

  it('uses a sea per area that gets rougher', () => {
    expect(generateAreas(1).map((area) => area.sea)).toEqual(AREAS.map((spec) => spec.sea));
    expect(AREAS[0]!.sea).toBe('calm');
    expect(AREAS[AREAS.length - 1]!.sea).toBe('stormy');
  });

  it('offers a choice of different fights where a layer is wide', () => {
    let widest = 0;
    for (const seed of SEEDS) {
      for (const node of generateArea(seed, 4).nodes) {
        widest = Math.max(widest, nodesInLayer(generateArea(seed, 4), node.layer).length);
      }
    }
    expect(widest).toBeGreaterThan(1);
    for (const seed of SEEDS.slice(0, 20)) {
      const graph = generateArea(seed, 4);
      for (let layer = 1; layer < graph.layers - 2; layer += 1) {
        const battles = nodesInLayer(graph, layer).filter((n) => n.kind === 'battle');
        if (battles.length === 2) {
          expect(new Set(battles.map((n) => n.battle)).size).toBe(2);
        }
      }
    }
  });
});

describe('the five areas grow', () => {
  it('has more layers in every later area', () => {
    for (let i = 1; i < AREAS.length; i += 1) {
      expect(AREAS[i]!.layers).toBeGreaterThan(AREAS[i - 1]!.layers);
    }
  });

  it('has more nodes in later areas on average over many seeds', () => {
    const averageNodes = AREAS.map((_, areaIndex) => {
      const total = SEEDS.reduce((sum, seed) => sum + generateArea(seed, areaIndex).nodes.length, 0);
      return total / SEEDS.length;
    });
    for (let i = 1; i < averageNodes.length; i += 1) {
      expect(averageNodes[i]!).toBeGreaterThan(averageNodes[i - 1]!);
    }
  });

  it('has more ports in later areas on average over many seeds', () => {
    const averagePorts = AREAS.map((_, areaIndex) => {
      const total = SEEDS.reduce((sum, seed) => sum + portNodes(generateArea(seed, areaIndex)).length, 0);
      return total / SEEDS.length;
    });
    for (let i = 1; i < averagePorts.length; i += 1) {
      expect(averagePorts[i]!).toBeGreaterThanOrEqual(averagePorts[i - 1]!);
    }
  });
});

describe('area specs', () => {
  const good: AreaSpec = AREAS[0]!;

  it('accepts the shipped areas', () => {
    for (const spec of AREAS) {
      expect(specProblem(spec)).toBeNull();
    }
  });

  it('refuses a spec that cannot be built', () => {
    expect(specProblem({ ...good, layers: 4 })).not.toBeNull();
    expect(specProblem({ ...good, maxWidth: 4 })).not.toBeNull();
    expect(specProblem({ ...good, portEvery: 1 })).not.toBeNull();
    expect(specProblem({ ...good, openingStandardLayers: -1 })).not.toBeNull();
    expect(
      specProblem({
        ...good,
        battleWeights: { standard: 0, survive: 0, salvage: 0, merchant: 0, ambush: 0 },
      }),
    ).not.toBeNull();
    expect(() => generateArea(1, 0, { ...good, layers: 3 })).toThrow(/Bad area spec/);
    expect(() => generateArea(1, 99)).toThrow(/no spec/);
  });

  it('builds the smallest legal area and a single-lane one', () => {
    const smallest = generateArea(7, 0, { ...good, layers: 5, maxWidth: 1 });
    expect(smallest.nodes).toHaveLength(5);
    expect(reachableFrom(smallest, smallest.startId).has(smallest.bossId)).toBe(true);
  });

  it('can run just the first areas for a short playtest', () => {
    expect(generateAreas(5, AREAS.slice(0, 2))).toHaveLength(2);
  });
});

describe('generateArea: the hunt', () => {
  const huntsIn = (seed: number, area: number) => generateArea(seed, area).nodes.filter((node) => node.kind === 'hunt');

  it('has no hunt in the first area, and one in each later area', () => {
    for (const seed of SEEDS) {
      expect(huntsIn(seed, 0)).toHaveLength(0);
      for (let area = 1; area < AREAS.length; area += 1) {
        expect(huntsIn(seed, area)).toHaveLength(1);
      }
    }
  });

  it('sits in a layer of a choice, past the opening, never on a port layer, and is no battle kind', () => {
    for (const seed of SEEDS) {
      for (let area = 1; area < AREAS.length; area += 1) {
        const graph = generateArea(seed, area);
        const hunt = huntsIn(seed, area)[0]!;
        const spec = AREAS[area]!;
        expect(nodesInLayer(graph, hunt.layer).length).toBeGreaterThanOrEqual(2);
        expect(hunt.layer).toBeGreaterThan(spec.openingStandardLayers + 1);
        expect(hunt.layer).toBeLessThanOrEqual(spec.layers - 4);
        expect(portLayers(spec).has(hunt.layer)).toBe(false);
        expect(hunt.battle).toBeUndefined();
      }
    }
  });

  it('changes nothing else about the map: without the hunt the same stop is an ordinary battle', () => {
    for (const seed of SEEDS) {
      const spec = AREAS[2]!;
      const withHunt = generateArea(seed, 2, spec);
      const without = generateArea(seed, 2, { ...spec, hunts: 0 });
      expect(withHunt.edges).toEqual(without.edges);
      withHunt.nodes.forEach((node, i) => {
        if (node.kind === 'hunt') {
          expect(without.nodes[i]!.kind).toBe('battle');
        } else {
          expect(node).toEqual(without.nodes[i]);
        }
      });
    }
  });

  it('is refused by a spec that asks for more than one', () => {
    expect(specProblem({ ...AREAS[1]!, hunts: 2 as never })).toMatch(/hunts/);
  });
});
