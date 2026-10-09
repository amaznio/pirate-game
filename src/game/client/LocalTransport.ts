import type { PlayerId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { TokenGenerationConfig } from '../domain/GameState';
import type { PlayerActions } from '../domain/TurnResult';
import type { GameController } from '../controller/GameController';
import type { EventBus } from '../events/EventBus';
import { redactState } from '../view/redact';
import type { GameView } from '../view/GameView';
import type { GameTransport } from './GameTransport';

/**
 * Connects a client to a host running in the same page. It behaves like a
 * network connection would: the client only ever gets a redacted view, and
 * every command goes through the host's validation. A socket transport later
 * replaces this class and nothing else.
 */
export class LocalTransport implements GameTransport {
  private readonly unregister: () => void;

  constructor(
    private readonly host: GameController,
    private readonly eventBus: EventBus,
    readonly viewerId: PlayerId,
  ) {
    if (!host.getState().players[viewerId]) {
      throw new Error(`Unknown player: ${viewerId}`);
    }
    this.unregister = host.registerClient(viewerId);
  }

  getView(): GameView {
    return redactState(
      this.host.getState(),
      this.viewerId,
      this.host.getPlanningSecondsRemaining(),
    );
  }

  subscribe(listener: (view: GameView) => void): () => void {
    return this.host.subscribe(() => listener(this.getView()));
  }

  onEvents(handler: (event: GameEvent) => void): () => void {
    return this.eventBus.on(handler);
  }

  getPendingEvents(): readonly GameEvent[] | null {
    return this.host.getPendingTurn()?.events ?? null;
  }

  syncDraft(plan: PlayerActions): void {
    this.host.submitDraft(this.viewerId, plan);
  }

  lockIn(plan: PlayerActions): void {
    this.host.submitPlayerPlan(this.viewerId, plan);
  }

  setTokenGeneration(patch: Partial<TokenGenerationConfig>): void {
    this.host.setTokenGeneration(this.viewerId, patch);
  }

  acknowledgeTurn(): void {
    this.host.acknowledgeTurn(this.viewerId);
  }

  restart(): void {
    this.host.startNewGame();
  }

  /** Disconnects from the host. */
  dispose(): void {
    this.unregister();
  }
}
