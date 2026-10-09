import type {
  GameState,
  PlayerState,
  TokenGenerationConfig,
} from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { PlayerActions, TurnResult } from '../domain/TurnResult';
import { createGame } from '../simulation/createGame';
import { resolveTurn } from '../simulation/resolveTurn';
import { beginNextTurn, spendMovementTokens } from '../simulation/tokens';
import { applyPlayerPlan, type PlanRejection } from '../simulation/plans';
import { EventBus } from '../events/EventBus';
import type { AIController } from '../ai/AIController';
import { createSimpleAI } from '../ai/simpleAI';
import { createDuelConfig, type MatchConfig } from '../config/matchConfig';

export type GameListener = (state: GameState) => void;

export interface GameControllerOptions {
  /** Decision maker used by every AI player without a specific controller. */
  ai?: AIController;
  /** Per-player AI controllers (e.g. different difficulties). */
  aiByPlayer?: Readonly<Record<PlayerId, AIController>>;
  /**
   * Milliseconds allowed for planning each turn. Pass `null` to disable the
   * timer (used by unit tests). Defaults to the match rules.
   */
  turnDurationMs?: number | null;
  /** The match to play. Defaults to the classic 1v1 duel. */
  config?: MatchConfig;
  /** Overrides the starting state. Useful for tests. Defaults to createGame(). */
  initialState?: GameState;
}

/**
 * The authoritative host of one match. It holds the full state, accepts plans
 * from human players, asks the AI for every AI player's plan, runs the pure
 * simulation, publishes events, and runs the turn timer. It is the only thing
 * that sees everyone's plans. Players never touch it directly: they connect
 * through a transport (see game/client), which gives each of them a redacted
 * view.
 *
 * It owns NO game rules; all rules live in game/simulation. The planning
 * countdown is flow state, so it lives here rather than in the deterministic
 * simulation.
 */
export class GameController {
  private state: GameState;
  private readonly config: MatchConfig;
  private readonly listeners = new Set<GameListener>();
  private readonly ai: AIController;
  private readonly aiByPlayer: Readonly<Record<PlayerId, AIController>>;
  private readonly turnDurationMs: number | null;
  private planningDeadline: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pendingTurn: TurnResult | null = null;
  /** Humans whose client is connected (they must finish animating each turn). */
  private readonly clients = new Set<PlayerId>();
  private readonly acknowledged = new Set<PlayerId>();

  constructor(
    private readonly eventBus: EventBus,
    options: GameControllerOptions = {},
  ) {
    this.ai = options.ai ?? createSimpleAI();
    this.aiByPlayer = options.aiByPlayer ?? {};
    this.config = options.config ?? createDuelConfig();
    this.state = options.initialState ?? createGame(this.config);

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

  /** The first human player, a sensible default viewer for a local game. */
  getFirstHumanId(): PlayerId | undefined {
    return Object.values(this.state.players).find(
      (player) => player.controller === 'human',
    )?.id;
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
   * The turn currently being animated, if any. Lets a client that connects
   * mid-turn replay events that were emitted before it subscribed.
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
      // Time is up: resolve with whatever everyone has queued so far.
      this.resolveNow();
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
    this.acknowledged.clear();
    this.armPlanningTimer();
    this.setState(createGame(this.config));
  }

  // --- Clients ------------------------------------------------------------

  /**
   * Registers a connected human. The next turn only begins once every
   * registered human has finished animating the last one. A human nobody has
   * connected for (e.g. a placeholder in a local game) never holds things up.
   */
  registerClient(playerId: PlayerId): () => void {
    this.clients.add(playerId);
    return () => {
      this.clients.delete(playerId);
      this.acknowledged.delete(playerId);
      this.advanceIfEveryoneAcknowledged();
    };
  }

  // --- Planning -----------------------------------------------------------

  /**
   * Stores a player's work-in-progress plan after validating it against what
   * they hold. It does not lock them in and can be replaced until they do.
   * Returns null on success or the reason it was rejected.
   */
  submitDraft(playerId: PlayerId, plan: PlayerActions): PlanRejection | null {
    const player = this.state.players[playerId];
    if (!player || player.controller !== 'human') {
      return 'unknown_player';
    }
    const result = applyPlayerPlan(this.state, playerId, plan);
    if (!result.ok) {
      return result.reason;
    }
    this.setState(result.state);
    return null;
  }

  /**
   * Accepts a human player's final plan, validates it, and locks them in. When
   * every human is locked in the turn ends early (unless the match rules say to
   * wait for the timer). Returns null on success or the rejection reason.
   */
  submitPlayerPlan(
    playerId: PlayerId,
    plan: PlayerActions,
  ): PlanRejection | null {
    const reason = this.submitDraft(playerId, plan);
    if (reason) {
      return reason;
    }
    this.lockInPlayer(playerId);
    return null;
  }

  /**
   * Locks a human in with the plan the host already holds for them (their last
   * draft). Their plan can no longer change. Returns the result if this call
   * resolved the turn.
   */
  lockInPlayer(playerId: PlayerId): TurnResult | null {
    const player = this.state.players[playerId];
    if (
      this.state.status !== 'planning' ||
      !player ||
      player.controller !== 'human' ||
      player.lockedIn
    ) {
      return null;
    }

    this.setState({
      ...this.state,
      players: {
        ...this.state.players,
        [playerId]: { ...player, lockedIn: true },
      },
    });
    return this.resolveIfReady();
  }

  /** Changes how a player's next movement token is chosen. */
  setTokenGeneration(
    playerId: PlayerId,
    patch: Partial<TokenGenerationConfig>,
  ): void {
    const player = this.state.players[playerId];
    if (!player) {
      return;
    }
    this.setState({
      ...this.state,
      players: {
        ...this.state.players,
        [playerId]: {
          ...player,
          tokenGeneration: { ...player.tokenGeneration, ...patch },
        },
      },
    });
  }

  // --- Turn resolution ----------------------------------------------------

  /** Humans whose ship is still afloat. A sunk human has nothing left to plan. */
  private livingHumans(): PlayerState[] {
    return Object.values(this.state.players).filter(
      (player) =>
        player.controller === 'human' &&
        (this.state.ships[player.shipId]?.hp ?? 0) > 0,
    );
  }

  private resolveIfReady(): TurnResult | null {
    const everyoneLocked = this.livingHumans().every(
      (player) => player.lockedIn,
    );
    const endEarly =
      this.state.rules.endTurnWhenAllLocked || this.turnDurationMs === null;
    return everyoneLocked && endEarly ? this.resolveNow() : null;
  }

  /** Resolves the turn now with every player's current plan. */
  private resolveNow(): TurnResult | null {
    if (this.state.status !== 'planning') {
      return null;
    }
    this.clearPlanningTimer();

    // Humans submit the plan the host holds for them (a human who never locked
    // in submits their last draft); AI players plan now. Every player pays for
    // their movement tokens from their own pool when the turn resolves.
    const submitted: Record<PlayerId, PlayerActions> = {};
    const players: Record<PlayerId, PlayerState> = {};
    for (const player of Object.values(this.state.players)) {
      const actions: PlayerActions =
        player.controller === 'ai'
          ? (this.aiByPlayer[player.id] ?? this.ai).chooseActions(
              this.state,
              player.id,
            )
          : { movement: player.queue, cannons: player.cannonQueue };
      submitted[player.id] = actions;
      players[player.id] = {
        ...player,
        tokens: spendMovementTokens(player.tokens, actions.movement),
      };
    }

    const resolving: GameState = {
      ...this.state,
      status: 'resolving',
      players,
    };
    this.setState(resolving);

    const result = resolveTurn(resolving, submitted);

    // Always animate first, even on the killing blow, so players see the
    // outcome before any game-over dialog appears.
    this.pendingTurn = result;
    this.acknowledged.clear();
    this.setState({ ...result.nextState, status: 'animating' });

    this.eventBus.emitMany(result.events);
    this.advanceIfEveryoneAcknowledged();
    return result;
  }

  /** A client reports that it has finished animating the resolved turn. */
  acknowledgeTurn(playerId: PlayerId): void {
    if (this.state.status !== 'animating') {
      return;
    }
    this.acknowledged.add(playerId);
    this.advanceIfEveryoneAcknowledged();
  }

  private advanceIfEveryoneAcknowledged(): void {
    if (this.state.status !== 'animating') {
      return;
    }
    for (const id of this.clients) {
      if (!this.acknowledged.has(id)) {
        return;
      }
    }

    this.pendingTurn = null;
    this.acknowledged.clear();

    if (this.state.outcome !== null) {
      this.setState({ ...this.state, status: 'game_over' });
      return;
    }

    const { state } = beginNextTurn(this.state);
    this.armPlanningTimer();
    this.setState(state);

    // Every human is out of the fight: do not make the spectators wait for the
    // timer, let the remaining ships carry on. (Needs a connected client, who
    // acknowledges each turn; without one this would spin.)
    if (this.clients.size > 0 && this.livingHumans().length === 0) {
      this.resolveIfReady();
    }
  }

  isPlanning(): boolean {
    return this.state.status === 'planning';
  }
}
