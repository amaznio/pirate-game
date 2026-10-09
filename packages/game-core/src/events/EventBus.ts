import type { GameEvent } from '../domain/GameEvent';

export type GameEventHandler = (event: GameEvent) => void;

/**
 * Minimal typed pub/sub used to carry simulation events from the controller
 * to the Phaser presentation layer. React state flows through the controller
 * subscription instead.
 */
export class EventBus {
  private readonly handlers = new Set<GameEventHandler>();

  on(handler: GameEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.off(handler);
  }

  off(handler: GameEventHandler): void {
    this.handlers.delete(handler);
  }

  emit(event: GameEvent): void {
    for (const handler of [...this.handlers]) {
      handler(event);
    }
  }

  emitMany(events: readonly GameEvent[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
