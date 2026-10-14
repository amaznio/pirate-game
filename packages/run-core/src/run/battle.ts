import {
  createDuelConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '@pirate/game-core/config/matchConfig';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { CarryOver, Modifier } from '@pirate/game-core/domain/CarryOver';
import { DEFAULT_OBJECTIVES } from '@pirate/game-core/domain/Objective';
import { AREAS, type AreaSpec } from '../config/areas';
import { generateArea } from '../graph/generateArea';
import { nodeById } from '../graph/query';
import type { BattleKind, RouteGraph, RouteNode } from '../graph/types';
import { createRng } from '../rng';
import { bossLoadout, classForHullLevel, maxHullFor } from './rules';
import type { RunState } from './types';

/** A battle ready to start, and what is needed to read its result afterwards. */
export interface BattleSetup {
  readonly config: MatchConfig;
  /** The player id of the hero's ship in `config` and in the match result. */
  readonly heroPlayerId: string;
  readonly kind: BattleKind | 'boss';
  readonly nodeId: string;
  /** What the player is told before the fight: the hero's class and who is against it. */
  readonly briefing: {
    readonly heroShipTypeId: string;
    readonly enemyShipTypeIds: readonly string[];
    readonly aiDifficulty: AiDifficulty;
    readonly sea: MapStyle;
  };
  /** How far through the whole run this battle is, 0 to 1; it sets how hard the enemy is. */
  readonly depth: number;
}

/** The area's graph for a run state. */
export function graphFor(state: RunState, specs: readonly AreaSpec[] = AREAS): RouteGraph {
  return generateArea(state.seed, state.areaIndex, specs[state.areaIndex]);
}

/** How far through the run a node is: 0 at the very start, close to 1 at the last boss. */
export function depthOf(state: RunState, graph: RouteGraph, node: RouteNode): number {
  return (state.areaIndex + node.layer / (graph.layers - 1)) / state.areaCount;
}

interface Fleet {
  readonly shipTypeIds: readonly string[];
  readonly aiDifficulty: AiDifficulty;
}

/** The enemy fleet of an ordinary battle: bigger ships, more of them and better pilots as the run goes on. */
export function fleetFor(depth: number): Fleet {
  const shipTypeId = depth < 0.3 ? 'sloop' : depth < 0.6 ? 'brigantine' : 'galleon';
  const count = 1 + (depth >= 0.3 ? 1 : 0) + (depth >= 0.65 ? 1 : 0);
  const aiDifficulty: AiDifficulty = depth < 0.25 ? 'easy' : depth < 0.6 ? 'normal' : 'hard';
  return { shipTypeIds: Array.from({ length: count }, () => shipTypeId), aiDifficulty };
}

/** A boss fleet: a Galleon flagship, with more escorts in later areas. */
export function bossFleetFor(areaIndex: number): Fleet {
  const escorts = Math.min(2, areaIndex);
  return {
    shipTypeIds: ['galleon', ...Array.from({ length: escorts }, () => 'brigantine')],
    aiDifficulty: areaIndex === 0 ? 'normal' : 'hard',
  };
}

/**
 * The battle for the node the ship is at. It is built from the state alone, so it
 * is the same every time it is asked for, and nothing about it needs saving.
 *
 * The hero sails the class its hull level gives, with the maximum hull and the
 * cannons per side the run has grown to (these replace the class's own), and
 * brings its current hull, cannonballs and extra cannon damage. A boss's flagship
 * is a Galleon grown past its class in the same way (see `bossLoadout`).
 */
export function buildBattle(state: RunState, specs: readonly AreaSpec[] = AREAS): BattleSetup {
  if (state.phase !== 'battle') {
    throw new Error('There is no battle to build: the ship is not at a battle or boss node');
  }
  const graph = graphFor(state, specs);
  const node = nodeById(graph, state.nodeId);
  const kind: BattleKind | 'boss' = node.kind === 'boss' ? 'boss' : (node.battle ?? 'standard');
  const depth = depthOf(state, graph, node);
  const fleet = kind === 'boss' ? bossFleetFor(state.areaIndex) : fleetFor(depth);
  const objectiveKind = kind === 'boss' || kind === 'standard' ? undefined : kind;
  const objective = objectiveKind === undefined ? undefined : DEFAULT_OBJECTIVES[objectiveKind];
  const shipTypeIds = [classForHullLevel(state.hullLevel).id, ...fleet.shipTypeIds];
  const seed = Math.floor(createRng(state.seed, 'battle', node.id)() * 4294967296);

  const options = {
    seed,
    aiDifficulty: fleet.aiDifficulty,
    sea: graph.sea,
    loot: true,
    shipTypeIds,
    ...(objective === undefined ? {} : { objective }),
  };
  const base =
    fleet.shipTypeIds.length === 1
      ? createDuelConfig(options)
      : createSkirmishConfig({ ...options, humans: 1, ais: fleet.shipTypeIds.length, teamMode: 'ffa' });

  const hero = base.participants.find((participant) => participant.controller === 'human');
  if (!hero) {
    throw new Error('The battle has no hero ship');
  }

  // The enemy fleet sails as one side. (Ambush and merchant matches already set their own sides.)
  const sidesAreSet = objectiveKind === 'ambush' || objectiveKind === 'merchant';
  const participants = sidesAreSet
    ? base.participants
    : base.participants.map((participant) =>
        participant.controller === 'ai' ? { ...participant, teamId: 'enemy' } : participant,
      );

  // Keep any modifier the match already gave the hero (an ambush's veteran guns).
  const existing = base.carryOver?.[hero.playerId];
  const mine: Modifier[] = state.cannonDamage > 0 ? [{ kind: 'cannonDamage', bonus: state.cannonDamage }] : [];
  const carry: CarryOver = {
    ...existing,
    maxHull: maxHullFor(state.hullLevel),
    cannonsPerSide: state.cannonsPerSide,
    hull: state.hull,
    ammo: state.ammo,
    modifiers: [...(existing?.modifiers ?? []), ...mine],
  };
  const flagship = kind === 'boss' ? participants.find((participant) => participant.controller === 'ai') : undefined;
  const flagshipCarry: Record<string, CarryOver> =
    flagship === undefined ? {} : { [flagship.playerId]: { ...base.carryOver?.[flagship.playerId], ...bossLoadout(state.areaIndex) } };

  const config: MatchConfig = {
    ...base,
    participants:
      kind === 'boss'
        ? participants.map((participant) =>
            participant === flagship ? { ...participant, name: 'Flagship' } : participant,
          )
        : participants,
    carryOver: { ...base.carryOver, ...flagshipCarry, [hero.playerId]: carry },
  };
  return {
    config,
    heroPlayerId: hero.playerId,
    kind,
    nodeId: node.id,
    depth,
    briefing: {
      heroShipTypeId: shipTypeIds[0]!,
      enemyShipTypeIds: fleet.shipTypeIds,
      aiDifficulty: fleet.aiDifficulty,
      sea: graph.sea,
    },
  };
}
