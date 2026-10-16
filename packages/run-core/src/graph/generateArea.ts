import { AREAS, specProblem, weightsForArea, type AreaSpec } from '../config/areas';
import { createRng, pickWeighted, randomInt } from '../rng';
import type { BattleKind, RouteEdge, RouteGraph, RouteNode } from './types';

/** The id of the node at a position in an area. */
export function nodeId(areaIndex: number, layer: number, index: number): string {
  return `a${areaIndex}:${layer}:${index}`;
}

/**
 * Which layers hold a port the player can choose: every `portEvery` layers in
 * the middle, never right after the landfall or right before the pre-boss port.
 */
export function portLayers(spec: AreaSpec): ReadonlySet<number> {
  const layers = new Set<number>();
  for (let layer = 2; layer <= spec.layers - 4; layer += 1) {
    if (layer % spec.portEvery === 0) {
      layers.add(layer);
    }
  }
  return layers;
}

/**
 * How many nodes sit in each layer. The landfall, the port before the boss and
 * the boss are alone in their layers, so every route passes through them. Other
 * layers differ in width from the one before, so routes fork and merge instead
 * of running side by side in separate lanes.
 */
function layerWidths(spec: AreaSpec, rng: () => number): number[] {
  const widths: number[] = [];
  for (let layer = 0; layer < spec.layers; layer += 1) {
    if (layer === 0 || layer >= spec.layers - 2) {
      widths.push(1);
      continue;
    }
    const previous = widths[layer - 1]!;
    const options = Array.from({ length: spec.maxWidth }, (_, i) => i + 1).filter((w) => w !== previous);
    widths.push(options.length > 0 ? options[randomInt(rng, 0, options.length - 1)]! : 1);
  }
  return widths;
}

/**
 * The legs between two neighbouring layers. A node joins every node whose slice
 * of the next layer overlaps its own slice, so no node is left without a way in
 * or a way out and no legs cross.
 */
function legsBetween(
  fromLayer: readonly RouteNode[],
  toLayer: readonly RouteNode[],
): RouteEdge[] {
  const a = fromLayer.length;
  const b = toLayer.length;
  const edges: RouteEdge[] = [];
  for (let i = 0; i < a; i += 1) {
    for (let j = 0; j < b; j += 1) {
      // Slices of the same line, on a common scale of a * b.
      if (Math.max(i * b, j * a) < Math.min((i + 1) * b, (j + 1) * a)) {
        edges.push({ from: fromLayer[i]!.id, to: toLayer[j]!.id, cost: 1 });
      }
    }
  }
  return edges;
}

/** Picks battle kinds for a layer, different from each other where there is a choice. */
function battleKinds(
  spec: AreaSpec,
  areaIndex: number,
  layer: number,
  width: number,
  rng: () => number,
): BattleKind[] {
  if (layer <= spec.openingStandardLayers) {
    return Array.from({ length: width }, () => 'standard' as const);
  }
  const chosen: BattleKind[] = [];
  let pool = weightsForArea(spec, areaIndex).filter((entry) => entry.weight > 0);
  for (let slot = 0; slot < width; slot += 1) {
    // Once every kind is used, the pool starts again so wide layers still fill.
    if (pool.length === 0) {
      pool = weightsForArea(spec, areaIndex).filter((entry) => entry.weight > 0);
    }
    const kind = pickWeighted(rng, pool);
    chosen.push(kind);
    pool = pool.filter((entry) => entry.item !== kind);
  }
  return chosen;
}

/**
 * Where an area's hunt goes: a battle stop in a middle layer that is two or more wide (so the ship
 * can choose another way), past the gentle opening and not right before the pre-boss port.
 * Null when no layer fits.
 */
function pickHuntStop(
  spec: AreaSpec,
  widths: readonly number[],
  ports: ReadonlySet<number>,
  runSeed: number,
  areaIndex: number,
): { layer: number; index: number } | null {
  const rng = createRng(runSeed, 'hunt', areaIndex);
  const candidates: { layer: number; index: number }[] = [];
  for (let layer = spec.openingStandardLayers + 2; layer <= spec.layers - 4; layer += 1) {
    const width = widths[layer]!;
    if (width < 2) {
      continue;
    }
    for (let index = 0; index < width; index += 1) {
      // A port in the layer takes one stop of its own; only the others are battles.
      candidates.push({ layer, index });
    }
  }
  const fitting = candidates.filter(({ layer }) => !ports.has(layer));
  const pool = fitting.length > 0 ? fitting : [];
  return pool.length === 0 ? null : pool[randomInt(rng, 0, pool.length - 1)]!;
}

/**
 * Builds one area of the voyage from the run seed. The same seed and area
 * number always give the same graph.
 *
 * Shape: layer 0 is the landfall port; the last layer is the boss; the layer
 * before it is a port, so the ship can always be repaired and upgraded before a
 * boss; more ports sit in the middle every `portEvery` layers.
 */
export function generateArea(
  runSeed: number,
  areaIndex: number,
  spec: AreaSpec | undefined = AREAS[areaIndex],
): RouteGraph {
  if (!spec) {
    throw new Error(`There is no spec for area ${areaIndex}`);
  }
  const problem = specProblem(spec);
  if (problem) {
    throw new Error(`Bad area spec: ${problem}`);
  }

  const rng = createRng(runSeed, 'area', areaIndex);
  const widths = layerWidths(spec, rng);
  const midPorts = portLayers(spec);
  const lastLayer = spec.layers - 1;

  // The hunt (if the area has one) takes a battle stop in a layer of a choice, so it can be sailed round.
  // It draws from a stream of its own, so the rest of the map is the same with or without it.
  const huntAt = (spec.hunts ?? 0) > 0 ? pickHuntStop(spec, widths, midPorts, runSeed, areaIndex) : null;

  const layers: RouteNode[][] = widths.map((width, layer) => {
    const portIndex = midPorts.has(layer) ? randomInt(rng, 0, width - 1) : -1;
    const kinds = battleKinds(spec, areaIndex, layer, width, rng);
    return Array.from({ length: width }, (_, index): RouteNode => {
      const base = {
        id: nodeId(areaIndex, layer, index),
        layer,
        index,
        x: (index + 0.5) / width,
        y: layer / lastLayer,
      };
      if (layer === lastLayer) {
        return { ...base, kind: 'boss' };
      }
      if (layer === 0) {
        return { ...base, kind: 'port', landfall: true };
      }
      if (layer === lastLayer - 1 || index === portIndex) {
        return { ...base, kind: 'port' };
      }
      if (huntAt !== null && huntAt.layer === layer && huntAt.index === index) {
        return { ...base, kind: 'hunt' };
      }
      return { ...base, kind: 'battle', battle: kinds[index]! };
    });
  });

  const edges: RouteEdge[] = [];
  for (let layer = 0; layer < lastLayer; layer += 1) {
    edges.push(...legsBetween(layers[layer]!, layers[layer + 1]!));
  }

  return {
    areaIndex,
    seed: runSeed,
    layers: spec.layers,
    sea: spec.sea,
    nodes: layers.flat(),
    edges,
    startId: layers[0]![0]!.id,
    bossId: layers[lastLayer]![0]!.id,
  };
}

/** Every area of a run, in order. */
export function generateAreas(runSeed: number, specs: readonly AreaSpec[] = AREAS): RouteGraph[] {
  return specs.map((spec, areaIndex) => generateArea(runSeed, areaIndex, spec));
}
