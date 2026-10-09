import {
  DEFAULT_AI_DIFFICULTY,
  type GameState,
  type PlayerState,
} from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions } from '../domain/TurnResult';
import {
  ACTIONS_PER_TURN,
  cannonSlotIsEmpty,
  emptyCannonQueue,
  emptyQueue,
  emptyTokenInventory,
} from '../domain/Action';
import {
  ACTIVITY_CANNON_WEIGHT,
  ACTIVITY_MOVE_WEIGHT,
} from '../config/gameRules';
import type { GameView, PublicPlayerView } from './GameView';

/**
 * How busy a plan looks, from 0 to 1. This is the only thing about a plan that
 * other players ever see. Weights live in config.
 */
export function planActivity(plan: PlayerActions): number {
  const max = ACTIONS_PER_TURN * (ACTIVITY_MOVE_WEIGHT + ACTIVITY_CANNON_WEIGHT);
  if (max === 0) {
    return 0;
  }
  let score = 0;
  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    if (plan.movement[phase]) {
      score += ACTIVITY_MOVE_WEIGHT;
    }
    const cannon = plan.cannons[phase];
    if (cannon && !cannonSlotIsEmpty(cannon)) {
      score += ACTIVITY_CANNON_WEIGHT;
    }
  }
  return Math.min(1, score / max);
}

/**
 * Builds the view one player is allowed to see. Other players' queues, tokens,
 * cannonballs and token settings are dropped; only a public summary remains.
 * Pure: a server calls this once per connected player after every change.
 */
export function redactState(
  state: GameState,
  viewerId: PlayerId,
  planningSecondsRemaining: number | null,
): GameView {
  const self = state.players[viewerId];
  if (!self) {
    throw new Error(`Unknown player: ${viewerId}`);
  }

  const players: Record<PlayerId, PublicPlayerView> = {};
  for (const player of Object.values(state.players)) {
    players[player.id] = {
      id: player.id,
      name: player.name,
      teamId: player.teamId,
      shipId: player.shipId,
      controller: player.controller,
      aiDifficulty: player.controller === 'ai' ? player.aiDifficulty : null,
      lockedIn: player.lockedIn,
      activity: planActivity({
        movement: player.queue,
        cannons: player.cannonQueue,
      }),
    };
  }

  return {
    viewerId,
    turn: state.turn,
    status: state.status,
    board: state.board,
    rules: state.rules,
    ships: state.ships,
    obstacles: state.obstacles,
    self,
    players,
    outcome: state.outcome,
    planningSecondsRemaining,
  };
}

/**
 * Rebuilds a GameState from a view so the shared simulation can be run on the
 * client (the plan preview does this). Other players get empty placeholder
 * resources and plans: they are not known, and treated as standing still. If a
 * draft is given it replaces the viewer's queued plan.
 */
export function viewToState(view: GameView, draft?: PlayerActions): GameState {
  const players: Record<PlayerId, PlayerState> = {};
  for (const id of Object.keys(view.players)) {
    const pub = view.players[id];
    players[id] =
      id === view.viewerId
        ? {
            ...view.self,
            queue: draft ? draft.movement : view.self.queue,
            cannonQueue: draft ? draft.cannons : view.self.cannonQueue,
          }
        : {
            id: pub.id,
            name: pub.name,
            teamId: pub.teamId,
            shipId: pub.shipId,
            controller: pub.controller,
            aiDifficulty: pub.aiDifficulty ?? DEFAULT_AI_DIFFICULTY,
            tokens: emptyTokenInventory(),
            ammo: 0,
            queue: emptyQueue(),
            cannonQueue: emptyCannonQueue(),
            tokenGeneration: { auto: true, requested: 'FORWARD', rotationIndex: 0 },
            lockedIn: pub.lockedIn,
          };
  }

  return {
    seed: 0,
    turn: view.turn,
    status: view.status,
    board: view.board,
    rules: view.rules,
    ships: view.ships,
    obstacles: view.obstacles,
    players,
    outcome: view.outcome,
  };
}
