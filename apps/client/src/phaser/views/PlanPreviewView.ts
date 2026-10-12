import Phaser from 'phaser';
import type { GameState } from '@pirate/game-core/domain/GameState';
import type { PreviewShotOutcome } from '@pirate/game-core/simulation/preview';
import { previewPlayerPlan } from '@pirate/game-core/simulation/preview';
import { TILE_SIZE, gridToWorld } from '../Grid';
import { createShipGhost, headingToAngle } from './ShipView';
import { usesPixelEffects } from '../animation/animateEffects';

/** Pixel art draws paths as dots this far apart, each a square this wide. */
const DOT_GAP = 12;
const DOT_SIZE = 4;

function drawLine(
  g: Phaser.GameObjects.Graphics,
  pixel: boolean,
  width: number,
  color: number,
  alpha: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  if (!pixel) {
    g.lineStyle(width, color, alpha);
    g.lineBetween(from.x, from.y, to.x, to.y);
    return;
  }
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const dots = Math.max(1, Math.floor(length / DOT_GAP));
  g.fillStyle(color, alpha);
  for (let i = 0; i <= dots; i += 1) {
    const t = i / dots;
    const x = Math.round((from.x + (to.x - from.x) * t) / DOT_SIZE) * DOT_SIZE;
    const y = Math.round((from.y + (to.y - from.y) * t) / DOT_SIZE) * DOT_SIZE;
    g.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
  }
}

const SHOT_COLORS: Record<PreviewShotOutcome, number> = {
  ship: 0xff5a4f,
  obstacle: 0xd0d0d0,
  miss: 0xffffff,
};

/**
 * Ghost preview of the player's queued plan: a numbered ghost ship per planned
 * move and a line for every queued broadside. Rebuilt from scratch on each
 * change; the data comes from the simulation's dry run, not from view logic.
 */
export class PlanPreviewView {
  private container: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly playerId: string,
  ) {}

  update(state: GameState, enabled: boolean): void {
    this.clear();
    if (!enabled || state.status !== 'planning') {
      return;
    }
    const preview = previewPlayerPlan(state, this.playerId);
    if (!preview) {
      return;
    }

    const mine = state.ships[state.players[this.playerId]?.shipId ?? ''];
    const container = this.scene.add.container(0, 0).setDepth(15);
    const pixel = usesPixelEffects();
    const g = this.scene.add.graphics();
    container.add(g);

    let previous = gridToWorld(preview.start.position);
    let previousHeading = preview.start.heading;
    for (const step of preview.steps) {
      const at = gridToWorld(step.position);
      // The sea can carry or turn a ship in a phase where it has no move planned.
      const carried =
        !step.hasMove &&
        (at.x !== previous.x || at.y !== previous.y || step.heading !== previousHeading);
      previousHeading = step.heading;

      if (step.hasMove || carried) {
        drawLine(
          g,
          pixel,
          3,
          step.blocked ? 0xff5a4f : 0xffffff,
          step.hasMove ? 0.45 : 0.25,
          previous,
          at,
        );

        const ghost = createShipGhost(this.scene, mine, at.x, at.y)
          .setAlpha(step.blocked ? 0.2 : step.hasMove ? 0.35 : 0.2)
          .setRotation(headingToAngle(step.heading));
        if (pixel) {
          ghost.setTint(step.blocked ? 0xff9a90 : 0xbfe3ff);
        }
        const label = this.scene.add
          .text(at.x, at.y, String(step.phase + 1), {
            fontFamily: pixel ? '"Courier New", monospace' : 'Trebuchet MS, sans-serif',
            fontSize: pixel ? '24px' : '20px',
            fontStyle: 'bold',
            color: step.blocked ? '#ff8a80' : '#ffffff',
            stroke: '#0b1f2a',
            strokeThickness: 4,
          })
          .setOrigin(0.5);
        container.add([ghost, label]);
        previous = at;
      }

      for (const shot of step.shots) {
        const from = gridToWorld(step.position);
        const to = gridToWorld(shot.to);
        const color = SHOT_COLORS[shot.outcome];
        drawLine(g, pixel, 3, color, 0.8, from, to);
        g.fillStyle(color, 0.9);
        if (pixel) {
          const size = shot.outcome === 'miss' ? 8 : 16;
          g.fillRect(to.x - size / 2, to.y - size / 2, size, size);
        } else {
          g.fillCircle(to.x, to.y, shot.outcome === 'miss' ? 5 : TILE_SIZE * 0.14);
        }
      }
    }

    this.container = container;
  }

  clear(): void {
    this.container?.destroy(true);
    this.container = null;
  }
}
