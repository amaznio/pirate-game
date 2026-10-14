import type { RouteGraph, RouteNode } from './types';

/** The node with this id; throws if the graph has none, since that is a bug. */
export function nodeById(graph: RouteGraph, id: string): RouteNode {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) {
    throw new Error(`No node ${id} in area ${graph.areaIndex}`);
  }
  return node;
}

/** The nodes one leg away from this one, in map order. */
export function successors(graph: RouteGraph, id: string): RouteNode[] {
  return graph.edges
    .filter((edge) => edge.from === id)
    .map((edge) => nodeById(graph, edge.to))
    .sort((a, b) => a.index - b.index);
}

/** The nodes one leg back from this one, in map order. */
export function predecessors(graph: RouteGraph, id: string): RouteNode[] {
  return graph.edges
    .filter((edge) => edge.to === id)
    .map((edge) => nodeById(graph, edge.from))
    .sort((a, b) => a.index - b.index);
}

/** The nodes in one layer, left to right. */
export function nodesInLayer(graph: RouteGraph, layer: number): RouteNode[] {
  return graph.nodes.filter((node) => node.layer === layer).sort((a, b) => a.index - b.index);
}

/** Every node reachable by following legs forward from this one, itself included. */
export function reachableFrom(graph: RouteGraph, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of successors(graph, current)) {
      if (!seen.has(next.id)) {
        seen.add(next.id);
        queue.push(next.id);
      }
    }
  }
  return seen;
}

export function portNodes(graph: RouteGraph): RouteNode[] {
  return graph.nodes.filter((node) => node.kind === 'port');
}
