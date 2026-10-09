import type { Socket } from 'socket.io-client';
import type { PlayerId } from '@pirate/game-core/domain/Entity';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { TokenGenerationConfig } from '@pirate/game-core/domain/GameState';
import type { PlayerActions } from '@pirate/game-core/domain/TurnResult';
import type { GameTransport } from '@pirate/game-core/client/GameTransport';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pirate/game-core/protocol/messages';
import type { GameView } from '@pirate/game-core/view/GameView';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketTransportOptions {
  /** How long to wait after an edit before sharing the draft (ms). */
  draftDelayMs?: number;
  /** Called when the match is over and the player asks to play again. */
  onLeave?: () => void;
}

/**
 * Plays a match hosted on the game server. It gives the client what any
 * transport gives it (a view, events, commands) over a Socket.IO connection.
 *
 * The socket may drop and come back while the match goes on. This transport
 * survives that: it keeps the latest view, never replays a turn it already
 * showed, and holds back a plan it could not send until `flush()` is called
 * once the seat has been restored.
 */
export class SocketTransport implements GameTransport {
  private view: GameView;
  private readonly listeners = new Set<(view: GameView) => void>();
  private readonly eventHandlers = new Set<(event: GameEvent) => void>();
  /** Events of the turn being animated, for a client that subscribes late. */
  private pendingEvents: GameEvent[] | null = null;
  private lastTurnDelivered = -1;

  private latestDraft: PlayerActions | null = null;
  private lockInPlan: PlayerActions | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly draftDelayMs: number;

  private readonly onView = (view: GameView): void => this.receiveView(view);
  private readonly onTurn = (turn: { events: GameEvent[] }): void =>
    this.receiveTurn(turn.events);

  constructor(
    private readonly socket: GameSocket,
    readonly viewerId: PlayerId,
    initialView: GameView,
    private readonly options: SocketTransportOptions = {},
  ) {
    this.view = initialView;
    this.draftDelayMs = options.draftDelayMs ?? 150;
    socket.on('game:view', this.onView);
    socket.on('game:turn', this.onTurn);
  }

  getView(): GameView {
    return this.view;
  }

  subscribe(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvents(handler: (event: GameEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  getPendingEvents(): readonly GameEvent[] | null {
    return this.pendingEvents;
  }

  // --- Commands -----------------------------------------------------------

  /** Shares the work-in-progress plan, a moment after the last edit. */
  syncDraft(plan: PlayerActions): void {
    this.latestDraft = plan;
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
    }
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      this.sendDraft();
    }, this.draftDelayMs);
  }

  lockIn(plan: PlayerActions): void {
    this.clearDraftTimer();
    this.latestDraft = null;
    this.lockInPlan = plan;
    this.sendLockIn();
  }

  setTokenGeneration(patch: Partial<TokenGenerationConfig>): void {
    if (this.socket.connected) {
      this.socket.emit('game:tokens', patch);
    }
  }

  acknowledgeTurn(): void {
    if (this.socket.connected) {
      this.socket.emit('game:ack');
    }
  }

  restart(): void {
    this.options.onLeave?.();
  }

  /**
   * Sends anything that could not be sent while the connection was down. Call
   * this once the seat has been restored after a reconnect.
   */
  flush(): void {
    if (this.lockInPlan) {
      this.sendLockIn();
    } else if (this.latestDraft) {
      this.clearDraftTimer();
      this.sendDraft();
    }
  }

  dispose(): void {
    this.clearDraftTimer();
    this.socket.off('game:view', this.onView);
    this.socket.off('game:turn', this.onTurn);
    this.listeners.clear();
    this.eventHandlers.clear();
  }

  // --- Internals ----------------------------------------------------------

  private sendDraft(): void {
    if (this.latestDraft && this.socket.connected) {
      this.socket.emit('game:draft', this.latestDraft);
      this.latestDraft = null;
    }
  }

  private sendLockIn(): void {
    // Kept until the host confirms it with a view that shows us locked in, so
    // a plan sent into a dying connection is sent again after the reconnect.
    if (this.lockInPlan && this.socket.connected) {
      this.socket.emit('game:lockIn', this.lockInPlan);
    }
  }

  private clearDraftTimer(): void {
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
  }

  private receiveView(view: GameView): void {
    this.view = view;

    if (view.status !== 'animating') {
      this.pendingEvents = null;
    }
    // Once the host shows the plan as locked in, or the planning window is
    // over, there is nothing left to resend.
    if (view.self.lockedIn || view.status !== 'planning') {
      this.lockInPlan = null;
      this.latestDraft = null;
      this.clearDraftTimer();
    }

    for (const listener of [...this.listeners]) {
      listener(view);
    }
  }

  private receiveTurn(events: GameEvent[]): void {
    const start = events[0];
    if (start?.type === 'TURN_STARTED') {
      // A turn that was already shown (the host replays it after a reconnect)
      // must not be animated twice.
      if (start.turn <= this.lastTurnDelivered) {
        return;
      }
      this.lastTurnDelivered = start.turn;
    }

    this.pendingEvents = events;
    for (const event of events) {
      for (const handler of [...this.eventHandlers]) {
        handler(event);
      }
    }
  }
}
