import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { AREAS, type AreaSpec } from '../config/areas';
import { generateArea } from '../graph/generateArea';
import { nodeById, successors } from '../graph/query';
import type { RouteGraph, RouteNode } from '../graph/types';
import { buildBattle, graphFor } from './battle';
import {
  BATTLE_REWARD,
  HUNT_BOSS_BONUS,
  LANDFALL_REPAIR,
  PORT_REPAIR,
  START_AMMO,
  START_PLUNDER,
  TREASURE_PER_PLUNDER,
  UPGRADE_PRICE,
  ammoFullFor,
  maxHullFor,
} from './rules';
import { applyUpgrade, canTake, offerUpgrades } from './upgrades';
import {
  SAVE_VERSION,
  type RunAction,
  type RunEvent,
  type RunState,
  type RunStep,
  type UpgradeId,
} from './types';

export interface StartOptions {
  /** How many areas the run has; all of them by default. A short playtest can use fewer. */
  readonly areaCount?: number;
  readonly specs?: readonly AreaSpec[];
}

/**
 * A new run: a Sloop at the landfall of the first area, with a little plunder. The
 * landfall is a port, so the run opens at a shop.
 */
export function startRun(seed: number, options: StartOptions = {}): RunState {
  const specs = options.specs ?? AREAS;
  const areaCount = Math.max(1, Math.min(options.areaCount ?? specs.length, specs.length));
  const graph = generateArea(seed, 0, specs[0]);
  const base: RunState = {
    version: SAVE_VERSION,
    seed,
    areaCount,
    areaIndex: 0,
    nodeId: graph.startId,
    path: [graph.startId],
    phase: 'map',
    hullLevel: 0,
    hull: maxHullFor(0),
    ammo: START_AMMO,
    ammoBonus: 0,
    cannonsPerSide: 1,
    cannonDamage: 0,
    reloadBonus: 0,
    plunder: START_PLUNDER,
    upgrades: [],
    battlesWon: 0,
    legs: 0,
  };
  return arrive(base, nodeById(graph, graph.startId)).state;
}

/** The stops the ship can sail to from where it is (none unless it is free to choose). */
export function availableMoves(state: RunState, specs: readonly AreaSpec[] = AREAS): RouteNode[] {
  if (state.phase !== 'map') {
    return [];
  }
  return successors(graphFor(state, specs), state.nodeId);
}

const fail = (error: string): RunStep => ({ ok: false, error });
const ok = (state: RunState, events: readonly RunEvent[]): RunStep => ({ ok: true, state, events });

function isOver(state: RunState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat';
}

/**
 * The one way a run changes. Pure: it returns the new state and what happened, or
 * says why the action is not allowed. The same state and action always give the
 * same answer.
 */
export function applyAction(state: RunState, action: RunAction, specs: readonly AreaSpec[] = AREAS): RunStep {
  if (isOver(state)) {
    return fail('The run is over');
  }
  switch (action.type) {
    case 'abandon':
      return ok({ ...state, phase: 'defeat', defeatReason: 'abandoned', offer: undefined }, [
        { type: 'defeat', reason: 'abandoned' },
      ]);
    case 'travel':
      return travel(state, action.to, specs);
    case 'buyUpgrade':
      return buyUpgrade(state, action.upgrade);
    case 'leavePort':
      return leavePort(state);
    case 'finishBattle':
      return finishBattle(state, action.result, specs);
    case 'startBattle':
      return state.phase !== 'battle'
        ? fail('There is no battle to start')
        : state.battleStarted
          ? fail('The battle has already started')
          : ok({ ...state, battleStarted: true }, []);
    case 'loseBattle':
      return state.phase === 'battle'
        ? ok({ ...state, hull: 0, phase: 'defeat', defeatReason: 'sunk', battleStarted: undefined }, [{ type: 'defeat', reason: 'sunk' }])
        : fail('There is no battle to leave');
  }
}

function travel(state: RunState, to: string, specs: readonly AreaSpec[]): RunStep {
  if (state.phase !== 'map') {
    return fail('The ship cannot sail now: leave the port or finish the battle first');
  }
  const graph = graphFor(state, specs);
  const edge = graph.edges.find((candidate) => candidate.from === state.nodeId && candidate.to === to);
  if (!edge) {
    return fail(`There is no leg from ${state.nodeId} to ${to}`);
  }
  const next: RunState = { ...state, nodeId: to, path: [...state.path, to], legs: state.legs + 1 };
  const arrived = arrive(next, nodeById(graph, to));
  return ok(arrived.state, [{ type: 'travelled', to }, ...arrived.events]);
}

/** What happens on reaching a node: a port repairs the ship and puts its upgrades up for sale, a fight waits. */
function arrive(state: RunState, node: RouteNode): { state: RunState; events: RunEvent[] } {
  if (node.kind !== 'port') {
    return { state: { ...state, nodeId: node.id, phase: 'battle' }, events: [] };
  }
  const landfall = node.landfall === true;
  const maxHull = maxHullFor(state.hullLevel);
  const hull = Math.min(maxHull, state.hull + (landfall ? LANDFALL_REPAIR : PORT_REPAIR));
  const ammo = Math.max(state.ammo, ammoFullFor(state.hullLevel, state.ammoBonus));
  const stocked: RunState = { ...state, nodeId: node.id, hull, ammo };
  const offered: RunState = { ...stocked, phase: 'port', offer: offerUpgrades(stocked, node.id) };
  return {
    state: offered,
    events: [
      {
        type: 'portArrival',
        landfall,
        repaired: hull - state.hull,
        ammoGained: ammo - state.ammo,
      },
    ],
  };
}

function buyUpgrade(state: RunState, upgrade: UpgradeId): RunStep {
  if (state.phase !== 'port' || state.offer === undefined) {
    return fail('There is no port to buy at');
  }
  if (!state.offer.includes(upgrade)) {
    return fail(`${upgrade} is not for sale here`);
  }
  if (!canTake(state, upgrade)) {
    return fail(`${upgrade} would do nothing for this ship`);
  }
  const price = UPGRADE_PRICE[upgrade];
  if (state.plunder < price) {
    return fail(`${upgrade} costs ${price} plunder and the ship has ${state.plunder}`);
  }
  const applied = applyUpgrade(state, upgrade);
  const next: RunState = {
    ...applied.state,
    plunder: state.plunder - price,
    offer: state.offer.filter((id) => id !== upgrade),
    upgrades: [...state.upgrades, upgrade],
  };
  return ok(next, [{ type: 'upgraded', upgrade, price, ...(applied.refit ? { refit: applied.refit } : {}) }]);
}

function leavePort(state: RunState): RunStep {
  if (state.phase !== 'port') {
    return fail('The ship is not in a port');
  }
  return ok({ ...state, phase: 'map', offer: undefined }, []);
}

function finishBattle(
  state: RunState,
  result: MatchResult,
  specs: readonly AreaSpec[],
): RunStep {
  if (state.phase !== 'battle') {
    return fail('There is no battle to finish');
  }
  const setup = buildBattle(state, specs);
  const hero = result.ships.find((ship) => ship.playerId === setup.heroPlayerId);
  // A hunt is won by leaving through the exit with what the hold carries, not by being afloat at the end.
  const won =
    hero !== undefined &&
    result.outcome.kind === 'win' &&
    result.outcome.teamId === hero.teamId &&
    (setup.kind === 'hunt' ? result.hunt?.ending === 'left' && hero.escaped === true : hero.afloat);
  // A salvage race lost or drawn with the ship still afloat costs the cargo (no reward), not the voyage.
  if (hero !== undefined && !won && setup.kind === 'salvage' && hero.afloat) {
    return ok(
      {
        ...state,
        hull: Math.max(1, Math.min(maxHullFor(state.hullLevel), hero.hull)),
        ammo: Math.max(0, hero.ammo),
        battleStarted: undefined,
        phase: 'map',
      },
      [{ type: 'battleLost', kind: 'salvage' }],
    );
  }
  if (!hero || !won) {
    return ok({ ...state, hull: 0, phase: 'defeat', defeatReason: 'sunk', battleStarted: undefined }, [
      { type: 'defeat', reason: 'sunk' },
    ]);
  }

  const haul = setup.kind === 'hunt' ? Math.max(0, result.hunt?.haul ?? 0) : 0;
  const bossSlain = setup.kind === 'hunt' && result.hunt?.bossSlain === true;
  const reward =
    BATTLE_REWARD[setup.kind] +
    (setup.kind === 'hunt' ? Math.floor(haul / TREASURE_PER_PLUNDER) + (bossSlain ? HUNT_BOSS_BONUS : 0) : 0);
  const afterFight: RunState = {
    ...state,
    hull: Math.max(1, Math.min(maxHullFor(state.hullLevel), hero.hull)),
    ammo: Math.max(0, hero.ammo),
    plunder: state.plunder + reward,
    battlesWon: state.battlesWon + 1,
    battleStarted: undefined,
  };
  const events: RunEvent[] = [
    {
      type: 'battleWon',
      kind: setup.kind,
      plunderGained: reward,
      ...(setup.kind === 'hunt' ? { haul, bossSlain } : {}),
    },
  ];

  if (setup.kind !== 'boss') {
    return ok({ ...afterFight, phase: 'map' }, events);
  }
  events.push({ type: 'areaCleared', areaIndex: state.areaIndex });
  if (state.areaIndex + 1 >= state.areaCount) {
    events.push({ type: 'victory' });
    return ok({ ...afterFight, phase: 'victory' }, events);
  }
  // On to the next, bigger area, starting at its landfall.
  const nextArea: RunState = { ...afterFight, areaIndex: state.areaIndex + 1 };
  const graph: RouteGraph = graphFor(nextArea, specs);
  const landfall = nodeById(graph, graph.startId);
  const arrived = arrive({ ...nextArea, nodeId: landfall.id, path: [landfall.id] }, landfall);
  return ok(arrived.state, [...events, ...arrived.events]);
}
