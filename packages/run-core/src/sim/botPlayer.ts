import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MatchConfig } from '@pirate/game-core/config/matchConfig';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { buildMatchResult } from '@pirate/game-core/simulation/matchResult';
import { runMatch } from '@pirate/game-core/testing/matchRunner';
import { AREAS, type AreaSpec } from '../config/areas';
import type { BattleKind } from '../graph/types';
import { buildBattle, graphFor, type BattleSetup } from '../run/battle';
import { applyAction, availableMoves, startRun } from '../run/engine';
import { classForHullLevel } from '../run/rules';
import type { DefeatReason, RunState, UpgradeId } from '../run/types';
import { chooseRoute, chooseUpgrade, type RoutePolicy } from './policies';

export interface BotOptions {
  /** How many areas the run has; all of them by default. */
  readonly areaCount?: number;
  /**
   * How well the bot sails its ship in a battle: a fixed level, or `matched`,
   * as good as the enemy it faces (a fair fight, so only the upgrades tilt it).
   */
  readonly heroSkill?: AiDifficulty | 'matched';
  /**
   * Do not fight: every battle is won, at a hull cost that grows with depth
   * (`scriptedHullLoss`). Measures the economy and the length of a run on their own.
   */
  readonly scripted?: boolean;
  /**
   * After a lost battle, record the loss and carry on as if the hero scraped
   * through (at the scripted hull cost), so every battle of the voyage is
   * measured, not just the ones the bot survives to reach.
   */
  readonly playOn?: boolean;
  readonly route?: RoutePolicy;
  /** Matches cut off at this many turns count as lost. */
  readonly maxBattleTurns?: number;
  readonly specs?: readonly AreaSpec[];
}

export interface BattleRecord {
  readonly areaIndex: number;
  readonly layer: number;
  readonly kind: BattleKind | 'boss' | 'hunt';
  /** The hero's class when the fight began. */
  readonly heroClass: string;
  readonly enemies: number;
  readonly aiDifficulty: AiDifficulty;
  readonly turns: number;
  readonly won: boolean;
  /** How the match ended: a win, a draw (everyone sunk together, or the time ran out), or a loss. */
  readonly outcome: 'win' | 'draw' | 'loss';
  /** The match did not finish in time, so the run counted it a loss. */
  readonly timedOut: boolean;
  readonly hullBefore: number;
  readonly hullAfter: number;
}

export interface RunReport {
  readonly seed: number;
  readonly result: 'victory' | 'defeat';
  readonly reason?: DefeatReason | 'timeout';
  /** The area the run ended in (0 for the first). */
  readonly areaReached: number;
  readonly battles: readonly BattleRecord[];
  readonly legs: number;
  /** Plunder in hand as the ship arrived at each port, before shopping. */
  readonly plunderAtPort: readonly number[];
  /** Plunder left unspent when the run ended. */
  readonly plunderLeft: number;
  readonly upgrades: readonly UpgradeId[];
  readonly hullLevel: number;
  readonly cannonsPerSide: number;
  readonly cannonDamage: number;
  readonly portsVisited: number;
  /** Turns played over all battles, a rough measure of how long the run takes a person. */
  readonly totalTurns: number;
  readonly wallMs: number;
}

/**
 * Plays a whole voyage with a simple bot: the real rules, the real route maps
 * and real battles fought by the AI (the bot's ship sails as well as `heroSkill`).
 * Deterministic for a given seed and options.
 */
export function playRun(seed: number, options: BotOptions = {}): RunReport {
  const specs = options.specs ?? AREAS;
  const skill = options.heroSkill ?? 'matched';
  const route = options.route ?? 'smart';
  const maxTurns = options.maxBattleTurns ?? 60;
  const started = performance.now();

  let state: RunState = startRun(seed, { ...(options.areaCount === undefined ? {} : { areaCount: options.areaCount }), specs });
  const battles: BattleRecord[] = [];
  const plunderAtPort: number[] = [];
  let portsVisited = 0;
  let timedOut = false;

  const act = (action: Parameters<typeof applyAction>[1]): RunState => {
    const step = applyAction(state, action, specs);
    if (!step.ok) {
      throw new Error(`The bot made an illegal move (${action.type}): ${step.error}`);
    }
    return step.state;
  };

  for (let guard = 0; guard < 5000 && state.phase !== 'victory' && state.phase !== 'defeat'; guard += 1) {
    if (state.phase === 'port') {
      portsVisited += 1;
      plunderAtPort.push(state.plunder);
      for (let pick = chooseUpgrade(state, state.offer ?? []); pick !== null; pick = chooseUpgrade(state, state.offer ?? [])) {
        state = act({ type: 'buyUpgrade', upgrade: pick });
      }
      state = act({ type: 'leavePort' });
    } else if (state.phase === 'map') {
      const next = chooseRoute(state, availableMoves(state, specs), route);
      state = act({ type: 'travel', to: next.id });
    } else {
      const setup = buildBattle(state, specs);
      const graph = graphFor(state, specs);
      const node = graph.nodes.find((candidate) => candidate.id === state.nodeId)!;
      const pilot = skill === 'matched' ? setup.briefing.aiDifficulty : skill;
      const config = {
        ...setup.config,
        participants: setup.config.participants.map((participant) =>
          participant.playerId === setup.heroPlayerId ? { ...participant, aiDifficulty: pilot } : participant,
        ),
      };
      // The match AI does not know how to leave a hunt yet, so a hunt is always scripted: the hero gets out with a set haul.
      const scripted = options.scripted === true || setup.kind === 'hunt';
      const record = scripted ? null : runMatch(config, { maxTurns });
      const result = record ? buildMatchResult(record.finalState) : scriptedResult(state, setup);
      const before = state;
      let won = false;
      if (result) {
        const step = applyAction(state, { type: 'finishBattle', result }, specs);
        if (!step.ok) {
          throw new Error(`The bot could not finish a battle: ${step.error}`);
        }
        won = step.events.some((event) => event.type === 'battleWon');
        const sunk = step.state.phase === 'defeat';
        state = step.state;
        if (sunk && options.playOn) {
          // Count the loss, then sail on as though the hero had won.
          state = before;
          state = act({ type: 'finishBattle', result: scriptedResult(before, setup) });
        }
      } else if (options.playOn) {
        // The match did not finish in time: a loss, but the voyage goes on.
        state = act({ type: 'finishBattle', result: scriptedResult(before, setup) });
      } else {
        timedOut = true;
        state = act({ type: 'loseBattle' });
      }
      battles.push({
        areaIndex: before.areaIndex,
        layer: node.layer,
        kind: setup.kind,
        heroClass: classForHullLevel(before.hullLevel).id,
        enemies: setup.briefing.enemyShipTypeIds.length,
        aiDifficulty: setup.briefing.aiDifficulty,
        turns: record?.turns ?? 0,
        won,
        outcome: won ? 'win' : outcomeOf(result, setup.heroPlayerId, setup.config),
        timedOut: result === null,
        hullBefore: before.hull,
        hullAfter: state.phase === 'defeat' ? 0 : state.hull,
      });
    }
  }

  const lost = state.phase !== 'victory';
  return {
    seed,
    result: lost ? 'defeat' : 'victory',
    ...(lost ? { reason: timedOut && state.defeatReason === 'sunk' ? ('timeout' as const) : (state.defeatReason ?? 'sunk') } : {}),
    areaReached: state.areaIndex,
    battles,
    legs: state.legs,
    plunderAtPort,
    plunderLeft: state.plunder,
    upgrades: state.upgrades,
    hullLevel: state.hullLevel,
    cannonsPerSide: state.cannonsPerSide,
    cannonDamage: state.cannonDamage,
    portsVisited,
    totalTurns: battles.reduce((sum, battle) => sum + battle.turns, 0),
    wallMs: performance.now() - started,
  };
}

/** A lost battle is a draw when nobody won (or the match never ended), else a loss. */
function outcomeOf(result: MatchResult | null, heroPlayerId: string, config: MatchConfig): 'draw' | 'loss' {
  if (result === null || result.outcome.kind !== 'win') {
    return 'draw';
  }
  const hero = config.participants.find((participant) => participant.playerId === heroPlayerId);
  return hero && result.outcome.teamId === hero.teamId ? 'draw' : 'loss';
}

/** The treasure a scripted hunt banks (the simulated hero does not really hunt). */
export const SCRIPTED_HUNT_HAUL = 10;

/** A made-up result for a battle: a win, or for a hunt a clean exit with a set haul. */
function scriptedResult(state: RunState, setup: BattleSetup): MatchResult {
  const win = scriptedWin(state, setup.heroPlayerId, setup.config, setup.depth);
  if (setup.kind !== 'hunt') {
    return win;
  }
  return {
    ...win,
    ships: win.ships.map((ship) => ({ ...ship, afloat: false, escaped: true })),
    hunt: { ending: 'left', bossSlain: false, monstersSunk: 0, haul: SCRIPTED_HUNT_HAUL },
  };
}

/** Hull a scripted win costs: a little early on, more in the late seas. */
export function scriptedHullLoss(depth: number): number {
  return 1 + Math.floor(depth * 2);
}

/** A made-up result in which the hero wins, at a hull and cannonball cost. */
function scriptedWin(state: RunState, heroPlayerId: string, config: MatchConfig, depth: number): MatchResult {
  const hero = config.participants.find((participant) => participant.playerId === heroPlayerId)!;
  return {
    outcome: { kind: 'win', teamId: hero.teamId },
    turns: 0,
    ships: [
      {
        playerId: hero.playerId,
        name: hero.name ?? hero.playerId,
        teamId: hero.teamId,
        shipTypeId: hero.shipTypeId,
        hull: Math.max(1, state.hull - scriptedHullLoss(depth)),
        maxHull: state.hull,
        afloat: true,
        ammo: Math.max(0, state.ammo - 1),
        tokens: 0,
        pickups: { barrel: 0, crate: 0, plank: 0 },
      },
    ],
  };
}
