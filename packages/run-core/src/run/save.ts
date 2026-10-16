import { AREAS, type AreaSpec } from '../config/areas';
import { generateArea } from '../graph/generateArea';
import { HULL_LEVEL_CAP, CANNONS_PER_SIDE_CAP, CANNON_DAMAGE_CAP, maxHullFor } from './rules';
import { SAVE_VERSION, UPGRADE_IDS, type DefeatReason, type RunPhase, type RunState } from './types';

/** The highest damage any version has saved (the cap was 3 before it was lowered). */
const SAVED_DAMAGE_MAX = 3;

/** A run as text, for `localStorage`. */
export function serializeRun(state: RunState): string {
  return JSON.stringify(state);
}

const PHASES: readonly RunPhase[] = ['map', 'port', 'battle', 'victory', 'defeat'];
const DEFEATS: readonly DefeatReason[] = ['sunk', 'abandoned'];

function whole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * A run read back from text. Anything that does not look exactly like a run the
 * engine could have made (a hand-edited save, an old version, a stop that is not
 * on the map) gives `null`, and the caller starts fresh instead of crashing.
 */
export function parseRun(text: string | null, specs: readonly AreaSpec[] = AREAS): RunState | null {
  if (text === null) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const s = raw as Record<string, unknown>;
  if (s.version !== SAVE_VERSION) {
    return null;
  }
  if (
    !whole(s.seed, 0, 4294967295) ||
    !whole(s.areaCount, 1, specs.length) ||
    !whole(s.areaIndex, 0, (s.areaCount as number) - 1) ||
    typeof s.nodeId !== 'string' ||
    typeof s.phase !== 'string' ||
    !PHASES.includes(s.phase as RunPhase) ||
    !whole(s.hullLevel, 0, HULL_LEVEL_CAP) ||
    !whole(s.cannonsPerSide, 1, CANNONS_PER_SIDE_CAP) ||
    !whole(s.cannonDamage, 0, SAVED_DAMAGE_MAX) ||
    !whole(s.plunder, 0, 100000) ||
    !whole(s.ammoBonus, 0, 1000) ||
    !whole(s.ammo, 0, 1000) ||
    !whole(s.battlesWon, 0, 100000) ||
    !whole(s.legs, 0, 100000) ||
    !Array.isArray(s.upgrades) ||
    !s.upgrades.every((id) => typeof id === 'string' && UPGRADE_IDS.includes(id as never))
  ) {
    return null;
  }
  const hullLevel = s.hullLevel as number;
  const phase = s.phase as RunPhase;
  if (!whole(s.hull, phase === 'defeat' ? 0 : 1, maxHullFor(hullLevel))) {
    return null;
  }
  if (phase === 'defeat' && !DEFEATS.includes(s.defeatReason as DefeatReason)) {
    return null;
  }
  // The stop has to be on this area's map, and a port must have its offer.
  const graph = generateArea(s.seed as number, s.areaIndex as number, specs[s.areaIndex as number]);
  const node = graph.nodes.find((candidate) => candidate.id === s.nodeId);
  if (!node) {
    return null;
  }
  // The path is the stops visited in this area: each on the map, ending where the ship is.
  const path = s.path;
  if (
    !Array.isArray(path) ||
    path.length === 0 ||
    path[path.length - 1] !== s.nodeId ||
    !path.every((id) => typeof id === 'string' && graph.nodes.some((candidate) => candidate.id === id))
  ) {
    return null;
  }
  if (s.battleStarted !== undefined && (s.battleStarted !== true || phase !== 'battle')) {
    return null;
  }
  if (phase === 'port') {
    if (node.kind !== 'port' || !Array.isArray(s.offer)) {
      return null;
    }
    if (!s.offer.every((id) => typeof id === 'string' && UPGRADE_IDS.includes(id as never))) {
      return null;
    }
  }
  if (phase === 'battle' && node.kind === 'port') {
    return null;
  }
  // A save from when the cap was higher keeps working, at the cap.
  if ((s.cannonDamage as number) > CANNON_DAMAGE_CAP) {
    return { ...(raw as RunState), cannonDamage: CANNON_DAMAGE_CAP };
  }
  return raw as RunState;
}
