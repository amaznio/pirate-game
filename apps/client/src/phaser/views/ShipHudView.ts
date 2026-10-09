import Phaser from 'phaser';

/** What an avatar shows. */
export interface ShipHudInfo {
  /** Initials in the badge. */
  readonly glyph: string;
  /** Team colour (ring around the badge). */
  readonly color: number;
  readonly hull: number;
  readonly maxHull: number;
  /** How busy their plan looks (0..1), or null when it is not shown. */
  readonly activity: number | null;
  readonly lockedIn: boolean;
  /** The local player's own ship gets a white outer ring. */
  readonly isViewer: boolean;
}

/** Badge radius in screen pixels (the avatar keeps a constant on-screen size). */
const RADIUS = 15;
const PIP_W = 8;
const PIP_H = 5;
const PIP_GAP = 2;

/**
 * The avatar floating above a ship: a team-coloured badge with the player's
 * initials, a row of hull pips, an activity bar (how busy their plan looks, for
 * other players while planning) and a tick once they have locked in. It lives
 * in world space but is scaled by 1/zoom so it stays the same size on screen.
 */
export class ShipHudView {
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private info: ShipHudInfo;

  constructor(scene: Phaser.Scene, info: ShipHudInfo) {
    this.info = info;
    this.graphics = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, info.glyph, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.container = scene.add
      .container(0, 0, [this.graphics, this.label])
      .setDepth(40);
    this.redraw();
  }

  setInfo(patch: Partial<ShipHudInfo>): void {
    this.info = { ...this.info, ...patch };
    this.redraw();
  }

  /** Puts the avatar at a world position, at a constant on-screen size. */
  place(x: number, y: number, zoom: number): void {
    this.container.setPosition(x, y);
    this.container.setScale(1 / zoom);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private redraw(): void {
    const { color, hull, maxHull, activity, lockedIn, isViewer, glyph } = this.info;
    const g = this.graphics;
    g.clear();
    this.label.setText(glyph);

    if (isViewer) {
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(0, 0, RADIUS + 3);
    }
    g.fillStyle(0x0b1f2a, 0.88);
    g.fillCircle(0, 0, RADIUS);
    g.lineStyle(3, color, 1);
    g.strokeCircle(0, 0, RADIUS);

    // Hull pips.
    const pipsWidth = maxHull * PIP_W + (maxHull - 1) * PIP_GAP;
    const pipsY = RADIUS + 6;
    for (let i = 0; i < maxHull; i += 1) {
      const x = -pipsWidth / 2 + i * (PIP_W + PIP_GAP);
      g.fillStyle(i < hull ? 0xc94f4f : 0x000000, i < hull ? 1 : 0.45);
      g.fillRect(x, pipsY, PIP_W, PIP_H);
    }

    // Activity bar: how busy the plan looks, never what it holds.
    if (activity !== null) {
      const width = Math.max(pipsWidth, 34);
      const y = pipsY + PIP_H + 3;
      g.fillStyle(0x000000, 0.55);
      g.fillRect(-width / 2, y, width, 3);
      g.fillStyle(0xe8d9b5, 1);
      g.fillRect(-width / 2, y, width * Math.max(0, Math.min(1, activity)), 3);
    }

    // Locked-in tick.
    if (lockedIn) {
      const cx = RADIUS * 0.8;
      const cy = -RADIUS * 0.8;
      g.fillStyle(0x4f9d69, 1);
      g.fillCircle(cx, cy, 6);
      g.lineStyle(1.5, 0xffffff, 1);
      g.beginPath();
      g.moveTo(cx - 3, cy);
      g.lineTo(cx - 1, cy + 2.5);
      g.lineTo(cx + 3, cy - 2.5);
      g.strokePath();
    }
  }
}
