import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import type { ObjectiveKind } from '@pirate/game-core/domain/Objective';

/** What a battle node asks of the player: an ordinary fight, or one of the objectives. */
export type BattleKind = 'standard' | ObjectiveKind;

export const BATTLE_KINDS: readonly BattleKind[] = ['standard', 'survive', 'salvage', 'merchant', 'ambush'];

/** What a stop on the map is. Fortress and hunt nodes come with later phases. */
export type NodeKind = 'port' | 'battle' | 'boss';

/**
 * One stop on a route. A route is drawn in layers from the first node at the
 * top to the boss at the bottom; `x` and `y` are layout hints in 0..1 so a map
 * can be drawn without knowing how it was made.
 */
export interface RouteNode {
  /** Unique within a run, e.g. `a2:5:1` (area 2, layer 5, second node). */
  readonly id: string;
  readonly layer: number;
  /** Position within the layer, left to right. */
  readonly index: number;
  readonly kind: NodeKind;
  /** Present exactly when `kind` is `battle`. */
  readonly battle?: BattleKind;
  /** The first port of an area: the landfall after the previous boss. */
  readonly landfall?: boolean;
  readonly x: number;
  readonly y: number;
}

/** A leg between two stops. `cost` multiplies the ship class's supply use for the leg. */
export interface RouteEdge {
  readonly from: string;
  readonly to: string;
  readonly cost: number;
}

/**
 * One area of the voyage: a layered graph that starts at a landfall and ends at
 * the area's boss. The model is generic (nodes with coordinates, edges with a
 * cost, region tags) so bigger maps or a grid sea can feed it later.
 */
export interface RouteGraph {
  /** 0 for the first area. */
  readonly areaIndex: number;
  /** The run seed the area was built from. */
  readonly seed: number;
  readonly layers: number;
  /** Region tag: the sea the battles in this area are fought on. */
  readonly sea: MapStyle;
  readonly nodes: readonly RouteNode[];
  readonly edges: readonly RouteEdge[];
  /** The landfall port, where the area begins. */
  readonly startId: string;
  /** The boss, where it ends. */
  readonly bossId: string;
}
