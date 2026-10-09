import Phaser from 'phaser';
import type { GameState } from '../../game/domain/GameState';
import type { GameEvent } from '../../game/domain/GameEvent';
import type { GameController } from '../../game/controller/GameController';
import { getShipBySide } from '../../game/simulation/selectors';
import { AssetKeys } from '../assets/AssetKeys';
import { TILE_SIZE, gridToWorld } from '../Grid';
import { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createShipView, headingToAngle } from '../views/ShipView';
import { createObstacleView } from '../views/ObstacleView';
import { EventAnimator } from '../animation/EventAnimator';
import { BattleCameraController } from '../camera/BattleCameraController';
import { getPhaserContext } from '../PhaserGame';

export class BattleScene extends Phaser.Scene {
  private views!: EntityViewRegistry;
  private animator!: EventAnimator;
  private cameraController!: BattleCameraController;
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

    this.add
      .tileSprite(0, 0, worldWidth, worldHeight, AssetKeys.water)
      .setOrigin(0)
      .setDepth(0);
    this.drawGrid(state, worldWidth, worldHeight);

    this.views = new EntityViewRegistry();
    this.animator = new EventAnimator(this, this.views);
    this.cameraController = new BattleCameraController(
      this,
      worldWidth,
      worldHeight,
    );

    this.syncViews(state);
    this.recenterOnPlayer();

    this.unsubscribeState = controller.subscribe((next) =>
      this.onStateChange(next),
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

  private drawGrid(
    state: GameState,
    worldWidth: number,
    worldHeight: number,
  ): void {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x1c4a57, 0.5);
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
