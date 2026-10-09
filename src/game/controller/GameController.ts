import type { GameState, PlayerState } from '../domain/GameState';
import type { CannonSide, MovementAction } from '../domain/Action';
import type { PlayerId } from '../domain/Entity';
import type { SubmittedActions, TurnResult } from '../domain/TurnResult';
import {
  cloneInventory,
  emptyCannonQueue,
  emptyQueue,
  totalQueuedShots,
} from '../domain/Action';
import { createGame } from '../simulation/createGame';
import { resolveTurn } from '../simulation/resolveTurn';
import { beginNextTurn, spendMovementTokens } from '../simulation/tokens';
import { EventBus } from '../events/EventBus';
import type { AIController } from '../ai/AIController';
import { createSimpleAI } from '../ai/simpleAI';
import { createDuelConfig, type MatchConfig } from '../config/matchConfig';

export type GameListener = (state: GameState) => void;

export interface GameControllerOptions {
  ai?: AIController;
  /**
   * Milliseconds allowed for planning each turn. Pass `null` to disable the
   * timer (used by unit tests). Defaults to the match rules.
   */
  turnDurationMs?: number | null;
  /** The match to play. Defaults to the classic 1v1 duel. */
  config?: MatchConfig;
  /** Overrides the starting state. Useful for tests. Defaults to createGame(). */
  initialState?: GameState;
  /**
   * The local human this controller plans for. Defaults to the first human
   * participant. Other humans are not controllable from here (that is the job
   * of a network transport) and pass their turn.
   */
  viewerId?: PlayerId;
}

/**
 * Coordinates application flow: accepts the local player's input, asks the AI
 * for every AI player's actions, runs the pure simulation, publishes events for
 * Phaser and exposes the resulting state to React.
 *
 * It owns NO game rules; all rules live in game/simulation. The planning
 * countdown is flow/presentation state, so it lives here rather than in the
 * deterministic simulation.
 */
export class GameController {
  private state: GameState;
  private readonly config: MatchConfig;
  private readonly viewerId: PlayerId;
  private readonly listeners = new Set<GameListener>();
  private readonly ai: AIController;
  private readonly turnDurationMs: number | null;
  private planningDeadline: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pendingTurn: TurnResult | null = null;

  constructor(
    private readonly eventBus: EventBus,
    options: GameControllerOptions = {},
  ) {
    this.ai = options.ai ?? createSimpleAI();
    this.config = options.config ?? createDuelConfig();
    this.state = options.initialState ?? createGame(this.config);

    const humans = Object.values(this.state.players).filter(
      (player) => player.controller === 'human',
    );
    const viewerId = options.viewerId ?? humans[0]?.id;
    if (!viewerId || !this.state.players[viewerId]) {
      throw new Error('A match needs at least one human player to control');
    }
    this.viewerId = viewerId;

    const rulesSeconds = this.state.rules.turnDurationSeconds;
    this.turnDurationMs =
      options.turnDurationMs === undefined
        ? rulesSeconds === null
          ? null
          : rulesSeconds * 1000
        : options.turnDurationMs;
    this.armPlanningTimer();
  }

  getState(): GameState {
    return this.state;
  }

  /** The player this controller plans for (the local human). */
  getViewerId(): PlayerId {
    return this.viewerId;
  }

  /** Epoch-ms at which the current planning window closes, or null. */
  getPlanningDeadline(): number | null {
    return this.planningDeadline;
  }

  /** Remaining planning time in seconds, or null when not planning. */
  getPlanningSecondsRemaining(): number | null {
    if (this.planningDeadline === null) {
      return null;
    }
    return Math.max(0, (this.planningDeadline - Date.now()) / 1000);
  }

  /** Stops any pending planning timer. Call when tearing the controller down. */
  dispose(): void {
    this.clearPlanningTimer();
  }

  /**
   * The turn currently being animated, if any. Lets the presentation layer
   * replay a turn whose events were emitted before it subscribed.
   */
  getPendingTurn(): TurnResult | null {
    return this.pendingTurn;
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: GameState): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      listener(state);
    }
  }

  private viewer(): PlayerState {
    return this.state.players[this.viewerId];
  }

  /** Applies a change to the local player's state and notifies listeners. */
  private updateViewer(patch: Partial<PlayerState>): void {
    this.setState({
      ...this.state,
      players: {
        ...this.state.players,
        [this.viewerId]: { ...this.viewer(), ...patch },
      },
    });
  }

  /**
   * Arms the planning countdown. Must be called before setState so that
   * subscribers see the new deadline in the same notification.
   */
  private armPlanningTimer(): void {
    this.clearPlanningTimer();
    if (this.turnDurationMs === null) {
      return;
    }
    this.planningDeadline = Date.now() + this.turnDurationMs;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.lockInTurn();
    }, this.turnDurationMs);
  }

  private clearPlanningTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.planningDeadline = null;
  }

  startNewGame(): void {
    this.pendingTurn = null;
    this.armPlanningTimer();
    this.setState(createGame(this.config));
  }

  // --- Planning commands -------------------------------------------------

  /**
   * Spends a movement token into a movement slot. Pass `slot` to target a
   * specific phase (so earlier slots can be left empty); otherwise the first
   * empty slot is used.
   */
  queuePlayerAction(action: MovementAction, slot?: number): void {
    if (this.state.status !== 'planning') {
      return;
    }
    const player = this.viewer();
    const inventory = cloneInventory(player.tokens);
    if (inventory[action] <= 0) {
      return;
    }

    const queue = [...player.queue];
    const target =
      slot !== undefined &&
      slot >= 0 &&
      slot < queue.length &&
      queue[slot] === null
        ? slot
        : queue.indexOf(null);
    if (target === -1) {
      return;
    }

    queue[target] = action;
    inventory[action] -= 1;
    this.updateViewer({ queue, tokens: inventory });
  }

  /** Removes a movement slot and returns its token to the pool. */
  removePlayerAction(index: number): void {
    if (this.state.status !== 'planning') {
      return;
    }
    const player = this.viewer();
    const queue = [...player.queue];
    const action = queue[index];
    if (!action) {
      return;
    }

    queue[index] = null;
    const inventory = cloneInventory(player.tokens);
    inventory[action] += 1;
    this.updateViewer({ queue, tokens: inventory });
  }

  /**
   * Toggles a broadside on/off for one phase. Cannonballs are not spent here
   * (the simulation deducts actual shots), but a shot cannot be queued beyond
   * the remaining pool.
   */
  togglePlayerCannon(phase: number, side: CannonSide): void {
    if (this.state.status !== 'planning') {
      return;
    }

    const player = this.viewer();
    const cannonQueue = player.cannonQueue.map((slot) => ({ ...slot }));
    const slot = cannonQueue[phase];
    if (!slot) {
      return;
    }

    if (slot[side]) {
      slot[side] = false;
    } else {
      const available = player.ammo - totalQueuedShots(player.cannonQueue);
      if (available <= 0) {
        return;
      }
      slot[side] = true;
    }

    this.updateViewer({ cannonQueue });
  }

  clearPlayerActions(): void {
    if (this.state.status !== 'planning') {
      return;
    }
    const player = this.viewer();
    const inventory = cloneInventory(player.tokens);
    for (const action of player.queue) {
      if (action) {
        inventory[action] += 1;
      }
    }

    this.updateViewer({
      queue: emptyQueue(),
      cannonQueue: emptyCannonQueue(),
      tokens: inventory,
    });
  }

  setAutoTokenGeneration(auto: boolean): void {
    this.updateViewer({
      tokenGeneration: { ...this.viewer().tokenGeneration, auto },
    });
  }

  setRequestedTokenType(token: MovementAction): void {
    this.updateViewer({
      tokenGeneration: { ...this.viewer().tokenGeneration, requested: token },
    });
  }

  // --- Turn resolution ---------------------------------------------------

  lockInTurn(): TurnResult | null {
    if (this.state.status !== 'planning') {
      return null;
    }
    this.clearPlanningTimer();

    // Humans submit the plan they built; AI players plan now and pay for their
    // movement tokens from their own pool, like everyone else.
    const submitted: Record<PlayerId, SubmittedActions[PlayerId]> = {};
    const players: Record<PlayerId, PlayerState> = {};
    for (const player of Object.values(this.state.players)) {
      if (player.controller === 'ai') {
        const actions = this.ai.chooseActions(this.state, player.id);
        submitted[player.id] = actions;
        players[player.id] = {
          ...player,
          tokens: spendMovementTokens(player.tokens, actions.movement),
        };
      } else {
        submitted[player.id] = {
          movement: player.queue,
          cannons: player.cannonQueue,
        };
        players[player.id] = player;
      }
    }

    const resolving: GameState = {
      ...this.state,
      status: 'resolving',
      players,
    };
    this.setState(resolving);

    const result = resolveTurn(resolving, submitted);

    // Always animate first, even on the killing blow, so the player sees the
    // outcome before any game-over dialog appears.
    this.pendingTurn = result;
    this.setState({ ...result.nextState, status: 'animating' });

    this.eventBus.emitMany(result.events);
    return result;
  }

  /** Called by the presentation layer once the turn animation has finished. */
  onAnimationComplete(): void {
    if (this.state.status !== 'animating') {
      return;
    }
    this.pendingTurn = null;

    if (this.state.outcome !== null) {
      this.setState({ ...this.state, status: 'game_over' });
      return;
    }

    const { state } = beginNextTurn(this.state);
    this.armPlanningTimer();
    this.setState(state);
  }

  isPlanning(): boolean {
    return this.state.status === 'planning';
  }
}
