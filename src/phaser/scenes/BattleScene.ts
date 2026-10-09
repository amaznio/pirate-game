import Phaser from 'phaser';
import type { GameState } from '../../game/domain/GameState';
import type { GameEvent } from '../../game/domain/GameEvent';
import type { GameController } from '../../game/controller/GameController';
import { getShipBySide } from '../../game/simulation/selectors';
import { AssetKeys, TileFrames } from '../assets/AssetKeys';
import { TILE_SIZE, WORLD_MARGIN_TILES, gridToWorld } from '../Grid';
import { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createShipView, headingToAngle } from '../views/ShipView';
import { createObstacleView } from '../views/ObstacleView';
import { EventAnimator } from '../animation/EventAnimator';
import { BattleCameraController } from '../camera/BattleCameraController';
import { PlanPreviewView } from '../views/PlanPreviewView';
import { usePreviewSettings } from '../../store/previewSettings';
import { getPhaserContext } from '../PhaserGame';

export class BattleScene extends Phaser.Scene {
  private views!: EntityViewRegistry;
  private animator!: EventAnimator;
  private cameraController!: BattleCameraController;
  private preview!: PlanPreviewView;
  private unsubscribePreviewSetting?: () => void;
  private controller!: GameController;
  private unsubscribeState?: () => void;
  private unsubscribeEvents?: () => void;
  private buffer: GameEvent[] = [];

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const { controller, eventBus } = getPhaserContext();
    this.controller = controller;

    const state = controller.getState();
    const worldWidth = state.board.width * TILE_SIZE;
    const worldHeight = state.board.height * TILE_SIZE;

    // The water extends past the board as a purely decorative margin; the
    // playable area is still board.width x board.height.
    const margin = WORLD_MARGIN_TILES * TILE_SIZE;
    this.add
      .tileSprite(
        -margin,
        -margin,
        worldWidth + margin * 2,
        worldHeight + margin * 2,
        AssetKeys.tiles,
        TileFrames.water,
      )
      .setOrigin(0)
      .setDepth(0);
    this.drawGrid(state, worldWidth, worldHeight, margin);

    this.views = new EntityViewRegistry();
    this.animator = new EventAnimator(this, this.views);
    this.cameraController = new BattleCameraController(
      this,
      worldWidth,
      worldHeight,
    );

    this.cameraController.setBottomInset(getPhaserContext().bottomInset);
    this.syncViews(state);
    this.recenterOnPlayer();

    this.preview = new PlanPreviewView(this);
    this.unsubscribeState = controller.subscribe((next) =>
      this.onStateChange(next),
    );
    this.unsubscribePreviewSetting = usePreviewSettings.subscribe(() =>
      this.refreshPreview(),
    );
    this.unsubscribeEvents = eventBus.on(this.onEvent);

    // If a turn was resolved before this scene existed, its events were already
    // emitted. Replay them so the game cannot hang waiting for an animation.
    if (controller.getState().status === 'animating') {
      this.playPendingTurn();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeEvents?.();
      this.unsubscribePreviewSetting?.();
      this.preview.clear();
      this.cameraController.destroy();
    });
  }

  recenterOnPlayer(): void {
    // The scene may be queried before create() has run (e.g. a recenter tap
    // while the game loop is still starting), so guard against that.
    if (!this.controller) {
      return;
    }
    const player = getShipBySide(this.controller.getState(), 'player');
    if (!player) {
      return;
    }
    const { x, y } = gridToWorld(player.position);
    this.cameraController.recenterOn(x, y);
  }

  /** Tells the camera how much of the bottom is covered by UI. */
  setBottomInset(pixels: number): void {
    if (!this.cameraController) {
      return;
    }
    this.cameraController.setBottomInset(pixels);
    // Keep the ship in the visible area until the player takes over the camera.
    if (!this.cameraController.userMoved) {
      this.recenterOnPlayer();
    }
  }

  private refreshPreview(): void {
    this.preview.update(
      this.controller.getState(),
      usePreviewSettings.getState().showPlanPreview,
    );
  }

  private drawGrid(
    state: GameState,
    worldWidth: number,
    worldHeight: number,
    margin: number,
  ): void {
    // Dim the decorative margin so the playable board reads clearly.
    const shade = this.add.graphics().setDepth(1);
    shade.fillStyle(0x0b1f2a, 0.35);
    shade.fillRect(-margin, -margin, worldWidth + margin * 2, margin);
    shade.fillRect(-margin, worldHeight, worldWidth + margin * 2, margin);
    shade.fillRect(-margin, 0, margin, worldHeight);
    shade.fillRect(worldWidth, 0, margin, worldHeight);
    shade.lineStyle(3, 0x0d3b49, 0.8);
    shade.strokeRect(0, 0, worldWidth, worldHeight);

    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x0d3b49, 0.5);
    for (let x = 0; x <= state.board.width; x += 1) {
      g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, worldHeight);
    }
    for (let y = 0; y <= state.board.height; y += 1) {
      g.lineBetween(0, y * TILE_SIZE, worldWidth, y * TILE_SIZE);
    }
  }

  /**
   * Snap views to authoritative state. Only called when no animation is in
   * flight (initial load, after a turn resolves, on restart) so ships never
   * teleport mid-animation.
   */
  private syncViews(state: GameState): void {
    for (const ship of Object.values(state.ships)) {
      if (ship.hp <= 0) {
        this.views.remove(ship.id);
        continue;
      }

      const existing = this.views.get(ship.id) as
        | Phaser.GameObjects.Container
        | undefined;
      const { x, y } = gridToWorld(ship.position);

      if (existing) {
        existing.setPosition(x, y);
        existing.setRotation(headingToAngle(ship.heading));
        existing.setAlpha(1);
        existing.setScale(1);
      } else {
        this.views.register(ship.id, createShipView(this, ship));
      }
    }

    for (const obstacle of Object.values(state.obstacles)) {
      if (!this.views.has(obstacle.id)) {
        this.views.register(obstacle.id, createObstacleView(this, obstacle));
      }
    }
  }

  private onStateChange(state: GameState): void {
    if (state.status === 'planning' || state.status === 'game_over') {
      this.syncViews(state);
    }
    this.preview?.update(state, usePreviewSettings.getState().showPlanPreview);
  }

  private onEvent = (event: GameEvent): void => {
    this.buffer.push(event);
    if (event.type !== 'TURN_ENDED') {
      return;
    }

    const batch = this.buffer;
    this.buffer = [];
    void this.animator.play(batch).then(() => {
      this.controller.onAnimationComplete();
      this.syncViews(this.controller.getState());
    });
  };

  /** Replays a turn whose events were emitted before this scene subscribed. */
  private playPendingTurn(): void {
    const pending = this.controller.getPendingTurn();
    if (!pending) {
      return;
    }
    void this.animator.play(pending.events).then(() => {
      this.controller.onAnimationComplete();
      this.syncViews(this.controller.getState());
    });
  }
}
