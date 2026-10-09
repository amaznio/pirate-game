import type {
  CannonSide,
  MovementAction,
  TokenInventory,
} from '../domain/Action';
import type { PlayerId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { GameState, TokenGenerationConfig } from '../domain/GameState';
import type { GameView } from '../view/GameView';
import { viewToState } from '../view/redact';
import type { GameTransport } from './GameTransport';
import {
  copyDraft,
  queueToken,
  remainingAmmo,
  remainingTokens,
  removeToken,
  toggleCannon,
  emptyDraft,
  type PlanDraft,
} from './draft';

/** Everything the UI needs, rebuilt whenever the view or the draft changes. */
export interface ClientSnapshot {
  readonly view: GameView;
  /** The plan being worked on. Private to this client until it is sent. */
  readonly draft: PlanDraft;
  /**
   * When planning closes, as epoch milliseconds on THIS machine (the host sends
   * a duration, so differences between clocks do not matter).
   */
  readonly deadline: number | null;
  /** Planning is open, the player has not locked in and their ship is afloat. */
  readonly canEdit: boolean;
  /** Movement tokens still free to queue (held minus used by the draft). */
  readonly tokensLeft: TokenInventory;
  /** Cannonballs still free to queue. */
  readonly ammoLeft: number;
}

export type ClientListener = (snapshot: ClientSnapshot) => void;

/**
 * One player's side of a match. It owns the draft plan (editing is local and
 * instant), mirrors the host's view of the game, and talks to the host only
 * through a GameTransport. React and Phaser depend on this, never on the host.
 */
export class GameClient {
  private snapshot: ClientSnapshot;
  private readonly listeners = new Set<ClientListener>();

  constructor(private readonly transport: GameTransport) {
    this.snapshot = this.buildSnapshot(transport.getView(), emptyDraft(), true);
    transport.subscribe((view) => this.onView(view));
  }

  get viewerId(): PlayerId {
    return this.transport.viewerId;
  }

  getSnapshot(): ClientSnapshot {
    return this.snapshot;
  }

  getView(): GameView {
    return this.snapshot.view;
  }

  subscribe(listener: ClientListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The viewer's state with their draft applied, for running the shared simulation. */
  getPreviewState(): GameState {
    return viewToState(this.snapshot.view, this.snapshot.draft);
  }

  // --- Events and turn flow ----------------------------------------------

  onEvents(handler: (event: GameEvent) => void): () => void {
    return this.transport.onEvents(handler);
  }

  getPendingEvents(): readonly GameEvent[] | null {
    return this.transport.getPendingEvents();
  }

  acknowledgeTurn(): void {
    this.transport.acknowledgeTurn();
  }

  restart(): void {
    this.transport.restart();
  }

  // --- Planning commands (edit the local draft) ---------------------------

  queueToken(action: MovementAction, slot?: number): void {
    if (!this.snapshot.canEdit) {
      return;
    }
    this.setDraft(
      queueToken(this.snapshot.draft, this.snapshot.view.self.tokens, action, slot),
    );
  }

  removeToken(index: number): void {
    if (this.snapshot.canEdit) {
      this.setDraft(removeToken(this.snapshot.draft, index));
    }
  }

  toggleCannon(phase: number, side: CannonSide): void {
    if (this.snapshot.canEdit) {
      this.setDraft(
        toggleCannon(this.snapshot.draft, this.snapshot.view.self.ammo, phase, side),
      );
    }
  }

  clearDraft(): void {
    if (this.snapshot.canEdit) {
      this.setDraft(emptyDraft());
    }
  }

  /** Sends the draft as the final plan. The host decides whether it is legal. */
  lockIn(): void {
    if (this.snapshot.canEdit) {
      this.transport.lockIn(this.snapshot.draft);
    }
  }

  setTokenGeneration(patch: Partial<TokenGenerationConfig>): void {
    this.transport.setTokenGeneration(patch);
  }

  // --- Internals ----------------------------------------------------------

  private setDraft(draft: PlanDraft): void {
    if (draft === this.snapshot.draft) {
      return;
    }
    this.snapshot = this.buildSnapshot(this.snapshot.view, draft, false);
    this.emit();
    this.transport.syncDraft(draft);
  }

  private onView(view: GameView): void {
    const previous = this.snapshot.view;
    // A fresh planning window starts from what the host holds (empty, or the
    // synced draft after a reconnect). Within a window the client's own draft
    // is the source of truth, so a host echo never overwrites it.
    const freshWindow =
      view.turn !== previous.turn ||
      (previous.status !== 'planning' && view.status === 'planning');
    const draft = freshWindow
      ? copyDraft({
          movement: view.self.queue,
          cannons: view.self.cannonQueue,
        })
      : this.snapshot.draft;

    this.snapshot = this.buildSnapshot(view, draft, false);
    this.emit();
  }

  private buildSnapshot(
    view: GameView,
    draft: PlanDraft,
    initial: boolean,
  ): ClientSnapshot {
    const seed = initial
      ? copyDraft({ movement: view.self.queue, cannons: view.self.cannonQueue })
      : draft;
    return {
      view,
      draft: seed,
      deadline:
        view.status === 'planning' && view.planningSecondsRemaining !== null
          ? Date.now() + view.planningSecondsRemaining * 1000
          : null,
      canEdit:
        view.status === 'planning' &&
        !view.self.lockedIn &&
        (view.ships[view.self.shipId]?.hp ?? 0) > 0,
      // Only while planning is the draft still waiting to be paid for. Once
      // the turn is being played the host has already taken the cost.
      tokensLeft:
        view.status === 'planning'
          ? remainingTokens(view.self.tokens, seed)
          : view.self.tokens,
      ammoLeft:
        view.status === 'planning'
          ? remainingAmmo(view.self.ammo, seed.cannons)
          : view.self.ammo,
    };
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener(this.snapshot);
    }
  }
}
