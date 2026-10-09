import Phaser from 'phaser';
import { TILE_SIZE } from '../Grid';

/** A ship that may need an indicator. */
export interface IndicatorTarget {
  readonly id: string;
  /** World position of the ship. */
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly color: number;
}

/** Distance in screen pixels from the screen edge to an indicator centre. */
const EDGE_MARGIN = 28;
const BADGE_RADIUS = 14;
const ARROW_DISTANCE = 24;

interface Item {
  readonly container: Phaser.GameObjects.Container;
  readonly badge: Phaser.GameObjects.Graphics;
  readonly arrow: Phaser.GameObjects.Graphics;
  readonly glyph: Phaser.GameObjects.Text;
  readonly distance: Phaser.GameObjects.Text;
  color: number;
}

/**
 * Arrows on the edge of the view that point at ships that are off screen. Each
 * shows the ship's badge and its distance in tiles, and can be clicked to pan
 * the camera to that ship. They live in world space but are scaled by 1/zoom,
 * so they keep a constant on-screen size and sit exactly on the screen edge.
 */
export class OffscreenIndicators {
  private readonly items = new Map<string, Item>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelect: (id: string) => void,
  ) {}

  update(
    camera: Phaser.Cameras.Scene2D.Camera,
    targets: readonly IndicatorTarget[],
    insets: { top: number; bottom: number },
  ): void {
    const zoom = camera.zoom;
    const view = camera.worldView;

    // The part of the world that is actually visible (not under the HUD/sheet).
    const visible = {
      left: view.x,
      right: view.right,
      top: view.y + insets.top / zoom,
      bottom: view.bottom - insets.bottom / zoom,
    };
    // Where indicators sit: inset from the visible edge, never inverted.
    const inset = EDGE_MARGIN / zoom;
    const safe = {
      left: visible.left + inset,
      right: Math.max(visible.left + inset, visible.right - inset),
      top: visible.top + inset,
      bottom: Math.max(visible.top + inset, visible.bottom - inset),
    };

    const seen = new Set<string>();
    for (const target of targets) {
      const onScreen =
        target.x >= visible.left &&
        target.x <= visible.right &&
        target.y >= visible.top &&
        target.y <= visible.bottom;
      if (onScreen) {
        continue;
      }

      seen.add(target.id);
      const item = this.itemFor(target);
      const x = Phaser.Math.Clamp(target.x, safe.left, safe.right);
      const y = Phaser.Math.Clamp(target.y, safe.top, safe.bottom);
      const angle = Math.atan2(target.y - y, target.x - x);

      item.container.setVisible(true);
      item.container.setPosition(x, y);
      item.container.setScale(1 / zoom);
      item.arrow.setPosition(
        Math.cos(angle) * ARROW_DISTANCE,
        Math.sin(angle) * ARROW_DISTANCE,
      );
      item.arrow.setRotation(angle);
      item.distance.setText(
        String(Math.max(1, Math.round(Math.hypot(target.x - x, target.y - y) / TILE_SIZE))),
      );
    }

    for (const [id, item] of this.items) {
      if (!seen.has(id)) {
        item.container.setVisible(false);
      }
    }
  }

  /** Drops indicators for ships that no longer exist. */
  retain(ids: ReadonlySet<string>): void {
    for (const [id, item] of this.items) {
      if (!ids.has(id)) {
        item.container.destroy(true);
        this.items.delete(id);
      }
    }
  }

  destroy(): void {
    for (const item of this.items.values()) {
      item.container.destroy(true);
    }
    this.items.clear();
  }

  private itemFor(target: IndicatorTarget): Item {
    const existing = this.items.get(target.id);
    if (existing) {
      if (existing.color !== target.color) {
        existing.color = target.color;
        this.drawBadge(existing);
        this.drawArrow(existing);
      }
      if (existing.glyph.text !== target.glyph) {
        existing.glyph.setText(target.glyph);
      }
      return existing;
    }

    const badge = this.scene.add.graphics();
    const arrow = this.scene.add.graphics();
    const glyph = this.scene.add
      .text(0, 0, target.glyph, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const distance = this.scene.add
      .text(0, BADGE_RADIUS + 8, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#e8d9b5',
        stroke: '#0b1f2a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const container = this.scene.add
      .container(0, 0, [badge, arrow, glyph, distance])
      .setDepth(50)
      .setAlpha(0.95);
    container.setSize(BADGE_RADIUS * 2, BADGE_RADIUS * 2);
    container.setInteractive(
      new Phaser.Geom.Circle(0, 0, BADGE_RADIUS + 6),
      Phaser.Geom.Circle.Contains,
    );
    container.input!.cursor = 'pointer';
    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.onSelect(target.id);
      },
    );

    const item: Item = { container, badge, arrow, glyph, distance, color: target.color };
    this.drawBadge(item);
    this.drawArrow(item);
    this.items.set(target.id, item);
    return item;
  }

  private drawBadge(item: Item): void {
    item.badge.clear();
    item.badge.fillStyle(0x0b1f2a, 0.9);
    item.badge.fillCircle(0, 0, BADGE_RADIUS);
    item.badge.lineStyle(3, item.color, 1);
    item.badge.strokeCircle(0, 0, BADGE_RADIUS);
  }

  private drawArrow(item: Item): void {
    // A small triangle pointing along +x; the item rotates it toward the ship.
    item.arrow.clear();
    item.arrow.fillStyle(item.color, 1);
    item.arrow.fillTriangle(-5, -6, -5, 6, 6, 0);
    item.arrow.lineStyle(1.5, 0x0b1f2a, 0.9);
    item.arrow.strokeTriangle(-5, -6, -5, 6, 6, 0);
  }
}
