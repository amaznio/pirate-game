import Phaser from 'phaser';
import type { GameState } from '@pirate/game-core/domain/GameState';
import type { PreviewShotOutcome } from '@pirate/game-core/simulation/preview';
import { previewPlayerPlan } from '@pirate/game-core/simulation/preview';
import { AssetKeys, ShipFrames } from '../assets/AssetKeys';
import { TILE_SIZE, gridToWorld } from '../Grid';
import { headingToAngle } from './ShipView';

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

    const container = this.scene.add.container(0, 0).setDepth(15);
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
        g.lineStyle(3, step.blocked ? 0xff5a4f : 0xffffff, step.hasMove ? 0.45 : 0.25);
        g.lineBetween(previous.x, previous.y, at.x, at.y);

        const ghost = this.scene.add
          .image(at.x, at.y, AssetKeys.ships, ShipFrames.player)
          .setScale(0.5)
          .setAlpha(step.blocked ? 0.2 : step.hasMove ? 0.35 : 0.2)
          .setRotation(headingToAngle(step.heading));
        const label = this.scene.add
          .text(at.x, at.y, String(step.phase + 1), {
            fontFamily: 'Trebuchet MS, sans-serif',
            fontSize: '20px',
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
        g.lineStyle(3, color, 0.8);
        g.lineBetween(from.x, from.y, to.x, to.y);
        g.fillStyle(color, 0.9);
        g.fillCircle(to.x, to.y, shot.outcome === 'miss' ? 5 : TILE_SIZE * 0.14);
      }
    }

    this.container = container;
  }

  clear(): void {
    this.container?.destroy(true);
    this.container = null;
  }
}
