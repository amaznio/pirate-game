import type { MatchConfig } from '../config/matchConfig';
import type { GameEvent } from '../domain/GameEvent';
import type { GameState, Outcome } from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions } from '../domain/TurnResult';
import { ACTIONS_PER_TURN, totalTokens } from '../domain/Action';
import { planAiActions } from '../ai/simpleAI';
import { createGame } from '../simulation/createGame';
import { resolveTurn } from '../simulation/resolveTurn';
import { beginNextTurn, spendMovementTokens } from '../simulation/tokens';

export const DEFAULT_MAX_TURNS = 60;

/** Everything worth knowing about one finished (or cut-off) AI-versus-AI match. */
export interface MatchRecord {
  /** The turn the match ended on, or `maxTurns` if it was cut off. */
  readonly turns: number;
  readonly outcome: Outcome | null;
  /** Hull left per ship id at the end. */
  readonly hull: Readonly<Record<string, number>>;
  /** Every event of every turn, in order. */
  readonly events: readonly GameEvent[];
  /** A fingerprint of the events and the final state: changes if any rule changes. */
  readonly hash: string;
  /** Phases in which a living ship left a slot empty because it had no tokens left. */
  readonly starvedPhases: number;
  /** All phases in which a ship was alive to plan (4 per ship per turn). */
  readonly shipPhases: number;
  /** Wall-clock time spent planning, in milliseconds. Not deterministic. */
  readonly planningMs: number;
  readonly finalState: GameState;
}

export interface RunOptions {
  readonly maxTurns?: number;
}

/** A small, stable string hash (cyrb53). Good enough to notice any change. */
export function hashText(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Plays a whole match with the AI sailing every ship (humans included, at the
 * difficulty stored on them) through the same resolve / next-turn cycle the
 * host uses. Pure apart from the clock used for `planningMs`.
 */
export function runMatch(config: MatchConfig, options: RunOptions = {}): MatchRecord {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  let state = createGame(config);
  const events: GameEvent[] = [];
  let starvedPhases = 0;
  let shipPhases = 0;
  let planningMs = 0;
  let turns = 0;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    turns = turn;
    const started = performance.now();
    const plans: Record<PlayerId, PlayerActions> = {};
    const players = { ...state.players };

    for (const id of Object.keys(state.players)) {
      const plan = planAiActions(state, id);
      plans[id] = plan;
      const alive = Object.values(state.ships).some(
        (ship) => ship.ownerId === id && ship.hp > 0,
      );
      if (alive) {
        const moves = plan.movement.filter((slot) => slot !== null).length;
        shipPhases += ACTIONS_PER_TURN;
        if (moves === totalTokens(state.players[id].tokens)) {
          starvedPhases += ACTIONS_PER_TURN - moves;
        }
      }
      players[id] = {
        ...state.players[id],
        tokens: spendMovementTokens(state.players[id].tokens, plan.movement),
      };
    }
    planningMs += performance.now() - started;

    const result = resolveTurn({ ...state, players }, plans);
    events.push(...result.events);
    state = result.nextState;
    if (state.outcome) {
      break;
    }
    state = beginNextTurn({ ...state, status: 'animating' }).state;
  }

  const hull: Record<string, number> = {};
  for (const ship of Object.values(state.ships)) {
    hull[ship.id] = ship.hp;
  }

  return {
    turns,
    outcome: state.outcome,
    hull,
    events,
    hash: hashText(JSON.stringify({ events, hull, outcome: state.outcome })),
    starvedPhases,
    shipPhases,
    planningMs,
    finalState: state,
  };
}
