import Phaser from 'phaser';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { Direction } from '@pirate/game-core/domain/Direction';
import { vectorFor } from '@pirate/game-core/domain/Direction';
import { TILE_SIZE } from '../Grid';
import type { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createProjectileView } from '../views/ProjectileView';
import { animateBlocked, animateMovement, animateTurn } from './animateMovement';
import { spawnMuzzleFlash, spawnDryFire } from './animateFire';
import { spawnImpact, spawnSplash, tweenProjectile } from './animateImpact';
import { animateDestroyed } from './animateDestroyed';
import { animatePush, animateSpin } from './animateTerrain';
import {
  spawnPixelImpact,
  spawnPixelMuzzle,
  spawnPixelSplash,
  usesPixelEffects,
} from './animateEffects';
import { startWake } from './animateWake';

type PhaseGroup = GameEvent[];

/** Lets the scene keep things that follow ships (avatars) in step with the fight. */
export interface AnimatorHooks {
  onDamage?(shipId: string, hp: number): void;
  onDestroyed?(shipId: string): void;
  /** A ship got clean away (a merchant that reached its exit). */
  onEscaped?(shipId: string): void;
  /** The edge a merchant is making for, so its escape can be drawn heading off it. */
  exitDirection?(): Direction | undefined;
  /** A ship took a pickup (or two ships met on one and it was lost). */
  onPickup?(event: Extract<GameEvent, { type: 'PICKUP_COLLECTED' | 'PICKUP_LOST' }>): void;
  /** A sailing monster moves, by its own plan or carried by wind or a whirlpool (resolves when it has arrived). */
  onMonsterMoved?(event: Extract<GameEvent, { type: 'MONSTER_MOVED' }>): Promise<void>;
  /** A monster lashes a cell (resolves when its whip has finished). */
  onMonsterAttack?(event: Extract<GameEvent, { type: 'MONSTER_ATTACKED' }>): Promise<void>;
  onMonsterDamaged?(event: Extract<GameEvent, { type: 'MONSTER_DAMAGED' }>): Promise<void>;
  /** A monster is sunk (resolves when it has gone). */
  onMonsterDestroyed?(event: Extract<GameEvent, { type: 'MONSTER_DESTROYED' }>): Promise<void>;
}

/** Milliseconds between one cannon of a side and the next. */
const CANNON_STAGGER_MS = 150;

/**
 * Matches a shot's launch to its impact. The cannons of one side all fire from
 * the same cell, so the cannon's number is part of the key.
 */
function projectileKey(
  event: Extract<GameEvent, { type: 'CANNON_FIRED' | 'PROJECTILE_HIT' | 'PROJECTILE_MISSED' }>,
): string {
  return `${event.shipId}:${event.side}:${event.cannon ?? 0}`;
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
    // A sailing monster moves at the same time as the ships.
    const monsterMoved = events.filter(
      (event): event is Extract<GameEvent, { type: 'MONSTER_MOVED' }> => event.type === 'MONSTER_MOVED',
    );
    const monsterSailing = monsterMoved
      .filter((event) => event.cause === 'sail')
      .map((event) => this.hooks.onMonsterMoved?.(event) ?? Promise.resolve());
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

    await Promise.all(monsterSailing);

    // Then the sea acts on the ships: wind carries them, whirlpools turn them.
    // Ships go in parallel; one ship's pushes and spin play in order.
    const board = events.filter(
      (event) => event.type === 'SHIP_PUSHED' || event.type === 'SHIP_SPUN',
    );
    const carried = [
      ...new Set(board.map((event) => (event as { shipId: string }).shipId)),
    ];
    await Promise.all(
      carried.map(async (shipId) => {
        for (const event of board) {
          if ((event as { shipId: string }).shipId === shipId) {
            await this.animateBoard(event);
          }
        }
      }),
    );

    // ...and on a monster that sails.
    await Promise.all(
      monsterMoved
        .filter((event) => event.cause !== 'sail')
        .map((event) => this.hooks.onMonsterMoved?.(event) ?? Promise.resolve()),
    );

    // Pickups are taken where the ships have ended up, before anyone fires.
    for (const event of events) {
      if (event.type === 'PICKUP_COLLECTED' || event.type === 'PICKUP_LOST') {
        this.hooks.onPickup?.(event);
      }
    }

    // A merchant that reached its exit sails off the board before anyone fires.
    for (const event of events) {
      if (event.type === 'SHIP_ESCAPED') {
        this.hooks.onEscaped?.(event.shipId);
        await this.animateEscaped(event);
      }
    }

    // A monster lashes the cells it marked, once the ships have settled and before anyone fires.
    const lashes = events.filter(
      (event): event is Extract<GameEvent, { type: 'MONSTER_ATTACKED' }> => event.type === 'MONSTER_ATTACKED',
    );
    await Promise.all(
      lashes.map(async (event) => {
        await this.hooks.onMonsterAttack?.(event);
        if (event.targetId) {
          this.flashShip(event.targetId);
        }
      }),
    );

    for (const event of events) {
      if (event.type === 'CANNON_BLOCKED') {
        this.spawnDryFire(event.shipId);
      }
    }

    // Every cannon fires, ships and sides together, but the cannons of one side
    // go one after the other: cannon n waits n steps. Each launch is followed in
    // the event list by its own impact.
    const volleys: Promise<void>[] = [];
    events.forEach((event, index) => {
      const impact = events[index + 1];
      if (
        event.type === 'CANNON_FIRED' &&
        impact &&
        (impact.type === 'PROJECTILE_HIT' || impact.type === 'PROJECTILE_MISSED')
      ) {
        volleys.push(this.fireAfter((event.cannon ?? 0) * CANNON_STAGGER_MS, event, impact));
      }
    });
    await Promise.all(volleys);

    for (const event of events) {
      if (event.type === 'SHIP_DAMAGED') {
        this.hooks.onDamage?.(event.shipId, event.hp);
      }
    }

    await Promise.all(
      events.map((event) =>
        event.type === 'MONSTER_DAMAGED' ? this.hooks.onMonsterDamaged?.(event) : undefined,
      ),
    );

    for (const event of events) {
      if (event.type === 'MONSTER_DESTROYED') {
        await this.hooks.onMonsterDestroyed?.(event);
      }
    }

    for (const event of events) {
      if (event.type === 'SHIP_DESTROYED') {
        this.hooks.onDestroyed?.(event.shipId);
        await this.animateDestroyed(event);
      }
    }
  }

  /** Launches one cannon's shot after a delay and plays it out to its impact. */
  private async fireAfter(
    delayMs: number,
    fired: Extract<GameEvent, { type: 'CANNON_FIRED' }>,
    impact: Extract<GameEvent, { type: 'PROJECTILE_HIT' | 'PROJECTILE_MISSED' }>,
  ): Promise<void> {
    if (delayMs > 0) {
      await new Promise<void>((resolve) => this.scene.time.delayedCall(delayMs, resolve));
    }
    this.spawnFire(fired);
    await this.animateImpact(impact);
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
        startWake(this.scene, view, 260);
        return animateMovement(this.scene, view, event);
      case 'SHIP_TURNED':
        return animateTurn(this.scene, view, event);
      case 'SHIP_BLOCKED':
        return animateBlocked(this.scene, view);
    }
  }

  private animateBoard(event: GameEvent): Promise<void> {
    if (event.type !== 'SHIP_PUSHED' && event.type !== 'SHIP_SPUN') {
      return Promise.resolve();
    }
    const view = this.registry.get(event.shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (!view) {
      return Promise.resolve();
    }
    if (event.type === 'SHIP_PUSHED') {
      startWake(this.scene, view, 190);
      return animatePush(this.scene, view, event);
    }
    return animateSpin(this.scene, view, event);
  }

  private spawnFire(event: Extract<GameEvent, { type: 'CANNON_FIRED' }>): void {
    const projectile = createProjectileView(this.scene, event.from);
    if (usesPixelEffects()) {
      spawnPixelMuzzle(this.scene, event.from, event.direction);
    } else {
      spawnMuzzleFlash(this.scene, projectile.x, projectile.y);
    }
    this.pendingProjectiles.set(projectileKey(event), projectile);
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
    const key = projectileKey(event);
    const projectile = this.pendingProjectiles.get(key);
    this.pendingProjectiles.delete(key);

    if (projectile) {
      await tweenProjectile(this.scene, projectile, event.to);
      projectile.destroy();
    }

    if (event.type === 'PROJECTILE_HIT') {
      if (usesPixelEffects()) {
        spawnPixelImpact(this.scene, event.to);
      } else {
        spawnImpact(this.scene, event.to);
      }
      if (event.targetKind === 'ship') {
        this.flashShip(event.targetId);
      }
    } else if (usesPixelEffects()) {
      spawnPixelSplash(this.scene, event.to);
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
    const flash = view.getData('flash') as (() => void) | undefined;
    if (flash) {
      flash();
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

  private async animateEscaped(
    event: Extract<GameEvent, { type: 'SHIP_ESCAPED' }>,
  ): Promise<void> {
    const view = this.registry.get(event.shipId) as Phaser.GameObjects.Container | undefined;
    if (!view) {
      return;
    }
    const way = vectorFor(this.hooks.exitDirection?.() ?? 'EAST');
    await new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: view,
        x: view.x + way.x * TILE_SIZE,
        y: view.y + way.y * TILE_SIZE,
        alpha: 0,
        duration: 800,
        ease: 'Sine.easeIn',
        onComplete: () => resolve(),
      });
    });
    this.registry.remove(event.shipId);
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
