import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import { BATTLE_KINDS, type BattleKind } from '../graph/types';

/**
 * How one area's route is built. All of this is configuration, not code, so a
 * playtest can run one or two areas and the numbers can be tuned later (the
 * balance harness, roadmap phase 7 slice E, is what sets them for real).
 */
export interface AreaSpec {
  /** Layers from the landfall (layer 0) to the boss (the last layer). At least 5. */
  readonly layers: number;
  /** Most nodes in one layer, 1 to 3. */
  readonly maxWidth: number;
  /** A middle layer holds a port every this many layers (at least 2). */
  readonly portEvery: number;
  /** The sea the battles in this area are fought on. */
  readonly sea: MapStyle;
  /** How many layers after the landfall are ordinary fights only (a gentle start). */
  readonly openingStandardLayers: number;
  /** How likely each battle kind is, before the area number tilts it. */
  readonly battleWeights: Readonly<Record<BattleKind, number>>;
  /** Hunts on the route: 0 or 1 (a middle layer of a choice, never the opening layers). None when left out. */
  readonly hunts?: 0 | 1;
}

const BASE_WEIGHTS: Readonly<Record<BattleKind, number>> = {
  standard: 4,
  merchant: 2,
  salvage: 2,
  survive: 2,
  ambush: 1,
};

/**
 * The five areas to start with, each a bigger route than the one before and on
 * rougher water. Starting guesses (10, 12, 14, 16 and 18 layers) from the
 * roadmap; the harness will tune them.
 */
export const AREAS: readonly AreaSpec[] = [
  { layers: 10, maxWidth: 3, portEvery: 3, sea: 'calm', openingStandardLayers: 2, battleWeights: BASE_WEIGHTS, hunts: 0 },
  { layers: 12, maxWidth: 3, portEvery: 3, sea: 'normal', openingStandardLayers: 1, battleWeights: BASE_WEIGHTS, hunts: 1 },
  { layers: 14, maxWidth: 3, portEvery: 3, sea: 'normal', openingStandardLayers: 0, battleWeights: BASE_WEIGHTS, hunts: 1 },
  { layers: 16, maxWidth: 3, portEvery: 3, sea: 'stormy', openingStandardLayers: 0, battleWeights: BASE_WEIGHTS, hunts: 1 },
  { layers: 18, maxWidth: 3, portEvery: 3, sea: 'stormy', openingStandardLayers: 0, battleWeights: BASE_WEIGHTS, hunts: 1 },
];

/** Checks a spec and says what is wrong with it, or returns nothing if it is fine. */
export function specProblem(spec: AreaSpec): string | null {
  if (!Number.isInteger(spec.layers) || spec.layers < 5) {
    return 'layers must be a whole number of at least 5 (landfall, a battle, a gap, a port and the boss)';
  }
  if (!Number.isInteger(spec.maxWidth) || spec.maxWidth < 1 || spec.maxWidth > 3) {
    return 'maxWidth must be 1, 2 or 3';
  }
  if (!Number.isInteger(spec.portEvery) || spec.portEvery < 2) {
    return 'portEvery must be a whole number of at least 2';
  }
  if (!Number.isInteger(spec.openingStandardLayers) || spec.openingStandardLayers < 0) {
    return 'openingStandardLayers must be a whole number, 0 or more';
  }
  if (spec.hunts !== undefined && spec.hunts !== 0 && spec.hunts !== 1) {
    return 'hunts must be 0 or 1';
  }
  if (!BATTLE_KINDS.some((kind) => (spec.battleWeights[kind] ?? 0) > 0)) {
    return 'battleWeights needs at least one kind with a positive weight';
  }
  return null;
}

/** The weights for an area: the later the area, the likelier the harder fights. */
export function weightsForArea(spec: AreaSpec, areaIndex: number): ReadonlyArray<{ item: BattleKind; weight: number }> {
  return BATTLE_KINDS.map((kind) => ({
    item: kind,
    weight: (spec.battleWeights[kind] ?? 0) + (kind === 'ambush' ? areaIndex : 0),
  }));
}
