import type { GameState } from '../domain/GameState';
import type { CannonSide, MovementAction } from '../domain/Action';
import type { TurnResult } from '../domain/TurnResult';
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
import { TURN_DURATION_SECONDS } from '../config/gameRules';

export type GameListener = (state: GameState) => void;

export interface GameControllerOptions {
  ai?: AIController;
  /**
   * Milliseconds allowed for planning each turn. Pass `null` to disable the
   * timer (used by unit tests). Defaults to TURN_DURATION_SECONDS.
   */
  turnDurationMs?: number | null;
  /** Overrides the starting state. Useful for tests. Defaults to createGame(). */
  initialState?: GameState;
}

/**
 * Coordinates application flow: accepts player input, asks the AI for enemy
 * actions, runs the pure simulation, publishes events for Phaser and exposes
 * the resulting state to React.
 *
 * It owns NO game rules; all rules live in game/simulation. The planning
 * countdown is flow/presentation state, so it lives here rather than in the
 * deterministic simulation.
 */
export class GameController {
  private state: GameState;
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
    this.turnDurationMs =
      options.turnDurationMs === undefined
        ? TURN_DURATION_SECONDS * 1000
        : options.turnDurationMs;
    this.state = options.initialState ?? createGame();
    this.armPlanningTimer();
  }

  getState(): GameState {
    return this.state;
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
    this.setState(createGame());
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
    const inventory = cloneInventory(this.state.tokenInventories.player);
    if (inventory[action] <= 0) {
      return;
    }

    const queue = [...this.state.queues.player];
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

    this.setState({
      ...this.state,
      queues: { ...this.state.queues, player: queue },
      tokenInventories: {
        ...this.state.tokenInventories,
        player: inventory,
      },
    });
  }

  /** Removes a movement slot and returns its token to the pool. */
  removePlayerAction(index: number): void {
    if (this.state.status !== 'planning') {
      return;
    }
    const queue = [...this.state.queues.player];
    const action = queue[index];
    if (!action) {
      return;
    }

    queue[index] = null;
    const inventory = cloneInventory(this.state.tokenInventories.player);
    inventory[action] += 1;

    this.setState({
      ...this.state,
      queues: { ...this.state.queues, player: queue },
      tokenInventories: {
        ...this.state.tokenInventories,
        player: inventory,
      },
    });
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

    const cannonQueue = this.state.cannonQueues.player.map((slot) => ({
      ...slot,
    }));
    const slot = cannonQueue[phase];
    if (!slot) {
      return;
    }

    if (slot[side]) {
      slot[side] = false;
    } else {
      const available =
        this.state.ammo.player - totalQueuedShots(this.state.cannonQueues.player);
      if (available <= 0) {
        return;
      }
      slot[side] = true;
    }

    this.setState({
      ...this.state,
      cannonQueues: { ...this.state.cannonQueues, player: cannonQueue },
    });
  }

  clearPlayerActions(): void {
    if (this.state.status !== 'planning') {
      return;
    }
    const inventory = cloneInventory(this.state.tokenInventories.player);
    for (const action of this.state.queues.player) {
      if (action) {
        inventory[action] += 1;
      }
    }

    this.setState({
      ...this.state,
      queues: { ...this.state.queues, player: emptyQueue() },
      cannonQueues: {
        ...this.state.cannonQueues,
        player: emptyCannonQueue(),
      },
      tokenInventories: {
        ...this.state.tokenInventories,
        player: inventory,
      },
    });
  }

  setAutoTokenGeneration(auto: boolean): void {
    this.setState({
      ...this.state,
      tokenGeneration: { ...this.state.tokenGeneration, auto },
    });
  }

  setRequestedTokenType(token: MovementAction): void {
    this.setState({
      ...this.state,
      tokenGeneration: { ...this.state.tokenGeneration, requested: token },
    });
  }

  // --- Turn resolution ---------------------------------------------------

  lockInTurn(): TurnResult | null {
    if (this.state.status !== 'planning') {
      return null;
    }
    this.clearPlanningTimer();

    const enemyActions = this.ai.chooseActions(this.state);

    const resolving: GameState = {
      ...this.state,
      status: 'resolving',
      tokenInventories: {
        ...this.state.tokenInventories,
        enemy: spendMovementTokens(
          this.state.tokenInventories.enemy,
          enemyActions.movement,
        ),
      },
    };
    this.setState(resolving);

    const result = resolveTurn(resolving, {
      player: {
        movement: this.state.queues.player,
        cannons: this.state.cannonQueues.player,
      },
      enemy: enemyActions,
    });

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

    if (this.state.winner !== null) {
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
