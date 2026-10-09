import type { PlayerId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { TokenGenerationConfig } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import type { GameView } from '../view/GameView';

/**
 * Everything a client needs from whatever runs the match: it receives views
 * and events, and it sends plans. The in-browser `LocalTransport` and a future
 * socket transport both implement this, so the UI and Phaser never know which
 * one they are talking to.
 *
 * Commands are fire-and-forget: the outcome of a command always shows up as a
 * new view, exactly as it would across a network.
 */
export interface GameTransport {
  /** The player this connection plays as. */
  readonly viewerId: PlayerId;

  /** The latest view this client has. */
  getView(): GameView;

  /** Called now and on every change to what this player can see. */
  subscribe(listener: (view: GameView) => void): () => void;

  /** Simulation events as a turn resolves (public: they happened on the board). */
  onEvents(handler: (event: GameEvent) => void): () => void;

  /** Events of the turn currently being animated, so a late subscriber can replay it. */
  getPendingEvents(): readonly GameEvent[] | null;

  /**
   * Shares the plan being worked on, without locking in. The host stores it
   * (hidden from others, other than a busyness bar) so a reconnect keeps it.
   */
  syncDraft(plan: PlayerActions): void;

  /** Sends the final plan and locks in. The host validates it. */
  lockIn(plan: PlayerActions): void;

  /** Changes how this player's next movement token is chosen. */
  setTokenGeneration(patch: Partial<TokenGenerationConfig>): void;

  /** The presentation finished animating the resolved turn. */
  acknowledgeTurn(): void;

  /** Starts a new match (only meaningful for a local game). */
  restart(): void;
}
