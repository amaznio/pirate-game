import Phaser from 'phaser';
import type { GameEvent } from '../../game/domain/GameEvent';
import type { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createProjectileView } from '../views/ProjectileView';
import { animateBlocked, animateMovement, animateTurn } from './animateMovement';
import { spawnMuzzleFlash, spawnDryFire } from './animateFire';
import { spawnImpact, spawnSplash, tweenProjectile } from './animateImpact';
import { animateDestroyed } from './animateDestroyed';

type PhaseGroup = GameEvent[];

/** Lets the scene keep things that follow ships (avatars) in step with the fight. */
export interface AnimatorHooks {
  onDamage?(shipId: string, hp: number): void;
  onDestroyed?(shipId: string): void;
}

function groupPhases(events: readonly GameEvent[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  let current: PhaseGroup | null = null;
  for (const event of events) {
    if (event.type === 'PHASE_STARTED') {
      current = [];
      groups.push(current);
    } else if (event.type === 'PHASE_ENDED') {
      current = null;
    } else if (current) {
      current.push(event);
    }
  }
  return groups;
}

/**
 * Consumes simulation events and plays them as Phaser animations. It never
 * changes authoritative state: it only moves/rotates existing views and spawns
 * temporary effect objects (projectiles, flashes, splashes).
 */
export class EventAnimator {
  private queue: Promise<void> = Promise.resolve();
  private readonly pendingProjectiles = new Map<
    string,
    Phaser.GameObjects.Image
  >();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly registry: EntityViewRegistry,
    private readonly hooks: AnimatorHooks = {},
  ) {}

  play(events: readonly GameEvent[]): Promise<void> {
    this.queue = this.queue.then(() => this.runTurn(events));
    return this.queue;
  }

  private async runTurn(events: readonly GameEvent[]): Promise<void> {
    for (const phase of groupPhases(events)) {
      await this.runPhase(phase);
    }
  }

  private async runPhase(events: PhaseGroup): Promise<void> {
    const movement = events.filter(
      (event) =>
        event.type === 'SHIP_MOVED' ||
        event.type === 'SHIP_TURNED' ||
        event.type === 'SHIP_BLOCKED',
    );
    // Ships move in parallel. Within one ship the move and turn play together,
    // then a bump (SHIP_BLOCKED) plays once it has stopped.
    const shipIds = [
      ...new Set(
        movement.map((event) => (event as { shipId: string }).shipId),
      ),
    ];
    await Promise.all(
      shipIds.map(async (shipId) => {
        const own = movement.filter(
          (event) => (event as { shipId: string }).shipId === shipId,
        );
        await Promise.all(
          own
            .filter((event) => event.type !== 'SHIP_BLOCKED')
            .map((event) => this.animateMovement(event)),
        );
        for (const event of own) {
          if (event.type === 'SHIP_BLOCKED') {
            await this.animateMovement(event);
          }
        }
      }),
    );

    for (const event of events) {
      if (event.type === 'CANNON_FIRED') {
        this.spawnFire(event);
      }
    }

    for (const event of events) {
      if (event.type === 'CANNON_BLOCKED') {
        this.spawnDryFire(event.shipId);
      }
    }

    const impacts = events.filter(
      (event) =>
        event.type === 'PROJECTILE_HIT' || event.type === 'PROJECTILE_MISSED',
    );
    await Promise.all(impacts.map((event) => this.animateImpact(event)));

    for (const event of events) {
      if (event.type === 'SHIP_DAMAGED') {
        this.hooks.onDamage?.(event.shipId, event.hp);
      }
    }

    for (const event of events) {
      if (event.type === 'SHIP_DESTROYED') {
        this.hooks.onDestroyed?.(event.shipId);
        await this.animateDestroyed(event);
      }
    }
  }

  private animateMovement(event: GameEvent): Promise<void> {
    if (
      event.type !== 'SHIP_MOVED' &&
      event.type !== 'SHIP_TURNED' &&
      event.type !== 'SHIP_BLOCKED'
    ) {
      return Promise.resolve();
    }

    const view = this.registry.get(event.shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (!view) {
      return Promise.resolve();
    }

    switch (event.type) {
      case 'SHIP_MOVED':
        return animateMovement(this.scene, view, event);
      case 'SHIP_TURNED':
        return animateTurn(this.scene, view, event);
      case 'SHIP_BLOCKED':
        return animateBlocked(this.scene, view);
    }
  }

  private spawnFire(event: Extract<GameEvent, { type: 'CANNON_FIRED' }>): void {
    const projectile = createProjectileView(this.scene, event.from);
    spawnMuzzleFlash(
      this.scene,
      projectile.x,
      projectile.y,
    );
    this.pendingProjectiles.set(`${event.shipId}:${event.side}`, projectile);
  }

  private spawnDryFire(shipId: string): void {
    const view = this.registry.get(shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (!view) {
      return;
    }
    spawnDryFire(this.scene, view.x, view.y);
  }

  private async animateImpact(
    event: Extract<
      GameEvent,
      { type: 'PROJECTILE_HIT' | 'PROJECTILE_MISSED' }
    >,
  ): Promise<void> {
    const key = `${event.shipId}:${event.side}`;
    const projectile = this.pendingProjectiles.get(key);
    this.pendingProjectiles.delete(key);

    if (projectile) {
      await tweenProjectile(this.scene, projectile, event.to);
      projectile.destroy();
    }

    if (event.type === 'PROJECTILE_HIT') {
      spawnImpact(this.scene, event.to);
      if (event.targetKind === 'ship') {
        this.flashShip(event.targetId);
      }
    } else {
      spawnSplash(this.scene, event.to);
    }
  }

  private flashShip(shipId: string): void {
    const view = this.registry.get(shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (!view) {
      return;
    }
    const sprite = view.getData('sprite') as
      | Phaser.GameObjects.Image
      | undefined;
    if (!sprite) {
      return;
    }
    sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => sprite.clearTint());
  }

  private async animateDestroyed(
    event: Extract<GameEvent, { type: 'SHIP_DESTROYED' }>,
  ): Promise<void> {
    const view = this.registry.get(event.shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (!view) {
      return;
    }
    await animateDestroyed(this.scene, view);
    this.registry.remove(event.shipId);
  }
}
