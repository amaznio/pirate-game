import Phaser from 'phaser';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import type { PickupKind, PickupMap } from '@pirate/game-core/domain/Pickup';
import { PICKUP_SPRITES, pickupFrameName } from '../assets/scallywag';
import { TILE_SIZE, gridToWorld } from '../Grid';

/** Pickups are drawn at a whole-number scale so the pixels stay crisp. */
const SCALE = 3;
/** One art pixel at that scale: how far a pickup bobs. */
const BOB = SCALE;
const BOB_MS = 520;
const DEPTH = 12;

/** The colour of the "+n" that floats up when a ship takes a pickup. */
const GAIN_COLOURS: Record<PickupKind, string> = {
  barrel: '#ffb347',
  crate: '#ffe27a',
  plank: '#8fe388',
};

interface PickupView {
  readonly kind: PickupKind;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly sprite: Phaser.GameObjects.Image;
  readonly bob: Phaser.Time.TimerEvent;
}

type Collected = Extract<GameEvent, { type: 'PICKUP_COLLECTED' | 'PICKUP_LOST' }>;

/**
 * The barrels, crates and planks afloat on the board: a sprite over a soft
 * shadow that bobs by one art pixel (never a fractional one, which would blur
 * it). It follows the authoritative pickups when the board is synced, and plays
 * a short pop where one is taken as its event plays.
 */
export class PickupField {
  private readonly views = new Map<string, PickupView>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Makes the pickups on screen the ones in the state. */
  sync(pickups: PickupMap | undefined): void {
    const wanted = pickups ?? {};
    for (const key of [...this.views.keys()]) {
      if (!wanted[key] || wanted[key].kind !== this.views.get(key)?.kind) {
        this.remove(key);
      }
    }
    for (const [key, pickup] of Object.entries(wanted)) {
      if (!this.views.has(key)) {
        this.add(key, pickup.kind);
      }
    }
  }

  /** Plays what happens where a pickup is taken (or lost). */
  collect(event: Collected): void {
    const key = `${event.at.x},${event.at.y}`;
    const view = this.views.get(key);
    const { x, y } = gridToWorld(event.at);
    if (view) {
      this.views.delete(key);
      view.bob.remove();
      this.scene.tweens.add({
        targets: [view.sprite, view.shadow],
        alpha: 0,
        duration: event.type === 'PICKUP_COLLECTED' ? 260 : 400,
        onComplete: () => {
          view.sprite.destroy();
          view.shadow.destroy();
        },
      });
      if (event.type === 'PICKUP_COLLECTED') {
        this.scene.tweens.add({
          targets: view.sprite,
          y: view.sprite.y - 14,
          scale: SCALE * 1.25,
          duration: 260,
          ease: 'Quad.easeOut',
        });
      }
    }
    if (event.type === 'PICKUP_COLLECTED') {
      this.floatGain(x, y, event.kind, event.gained);
    }
  }

  destroy(): void {
    for (const key of [...this.views.keys()]) {
      this.remove(key);
    }
  }

  private add(key: string, kind: PickupKind): void {
    const [cx, cy] = key.split(',').map(Number);
    const { x, y } = gridToWorld({ x: cx, y: cy });
    const sprite = this.scene.add
      .image(x, y, PICKUP_SPRITES[kind].texture, pickupFrameName(kind))
      .setScale(SCALE)
      .setDepth(DEPTH);
    const shadow = this.scene.add
      .ellipse(x, y + 8 * SCALE * 0.5 + 2, sprite.displayWidth * 0.9, 8, 0x06202e, 0.35)
      .setDepth(DEPTH - 1);

    // Not every pickup bobs in step: the phase comes from its cell.
    let up = (cx * 3 + cy) % 2 === 0;
    const place = (): void => {
      sprite.y = y - (up ? BOB : 0);
      shadow.setScale(up ? 0.85 : 1);
    };
    place();
    const bob = this.scene.time.addEvent({
      delay: BOB_MS,
      loop: true,
      callback: () => {
        up = !up;
        place();
      },
    });
    this.views.set(key, { kind, shadow, sprite, bob });
  }

  private remove(key: string): void {
    const view = this.views.get(key);
    if (!view) {
      return;
    }
    view.bob.remove();
    view.sprite.destroy();
    view.shadow.destroy();
    this.views.delete(key);
  }

  /** A "+n" that rises from where a ship took a pickup ("0" shows it was already full). */
  private floatGain(x: number, y: number, kind: PickupKind, gained: number): void {
    const text = this.scene.add
      .text(x, y - TILE_SIZE * 0.3, gained > 0 ? `+${gained}` : '0', {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: gained > 0 ? GAIN_COLOURS[kind] : '#c9c9c9',
        stroke: '#06202e',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(80);
    this.scene.tweens.add({
      targets: text,
      y: text.y - 34,
      alpha: 0,
      duration: 900,
      delay: 150,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }
}
