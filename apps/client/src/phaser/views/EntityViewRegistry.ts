import type Phaser from 'phaser';
import type { EntityId } from '@pirate/game-core/domain/Entity';

/**
 * The only bridge between domain entity ids and Phaser game objects. The
 * domain never knows about sprites; the presentation layer looks them up here.
 */
export class EntityViewRegistry {
  private readonly views = new Map<EntityId, Phaser.GameObjects.GameObject>();

  register(id: EntityId, view: Phaser.GameObjects.GameObject): void {
    this.views.set(id, view);
  }

  get(id: EntityId): Phaser.GameObjects.GameObject | undefined {
    return this.views.get(id);
  }

  has(id: EntityId): boolean {
    return this.views.has(id);
  }

  remove(id: EntityId): void {
    const view = this.views.get(id);
    if (view) {
      view.destroy();
      this.views.delete(id);
    }
  }

  clear(): void {
    for (const view of this.views.values()) {
      view.destroy();
    }
    this.views.clear();
  }
}
