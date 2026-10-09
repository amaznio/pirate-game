import Phaser from 'phaser';
import type { GameView } from '../../game/view/GameView';
import type { ClientSnapshot, GameClient } from '../../game/client/GameClient';
import type { GameEvent } from '../../game/domain/GameEvent';
import { assignTeamStyles, avatarGlyph } from '../../presentation/teamStyle';
import { AssetKeys, TileFrames } from '../assets/AssetKeys';
import { TILE_SIZE, WORLD_MARGIN_TILES, gridToWorld } from '../Grid';
import { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createShipView, headingToAngle } from '../views/ShipView';
import { createObstacleView } from '../views/ObstacleView';
import { ShipHudView } from '../views/ShipHudView';
import {
  OffscreenIndicators,
  type IndicatorTarget,
} from '../views/OffscreenIndicators';
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
  private indicators!: OffscreenIndicators;
  /** Avatar above each ship, by ship id. */
  private readonly huds = new Map<string, ShipHudView>();
  private unsubscribePreviewSetting?: () => void;
  private client!: GameClient;
  private unsubscribeState?: () => void;
  private unsubscribeEvents?: () => void;
  private buffer: GameEvent[] = [];

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const { client, insets } = getPhaserContext();
    this.client = client;

    const state = client.getView();
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
    this.animator = new EventAnimator(this, this.views, {
      onDamage: (shipId, hp) => this.huds.get(shipId)?.setInfo({ hull: hp }),
      onDestroyed: (shipId) => this.removeHud(shipId),
    });
    this.cameraController = new BattleCameraController(
      this,
      worldWidth,
      worldHeight,
    );
    this.indicators = new OffscreenIndicators(this, (shipId) =>
      this.panToShip(shipId),
    );

    this.cameraController.setInsets(insets);
    this.syncAll(state);
    this.recenterOnPlayer();

    // The canvas can still be settling to its final size (and the zoom floor
    // with it), so keep the player's ship in view until they take the camera.
    this.scale.on('resize', this.onResize, this);

    this.preview = new PlanPreviewView(this, client.viewerId);
    this.unsubscribeState = client.subscribe((snapshot) =>
      this.onSnapshot(snapshot),
    );
    this.unsubscribePreviewSetting = usePreviewSettings.subscribe(() =>
      this.refreshPreview(),
    );
    this.unsubscribeEvents = client.onEvents(this.onEvent);

    // If a turn was resolved before this scene existed, its events were already
    // emitted. Replay them so the game cannot hang waiting for an animation.
    if (client.getView().status === 'animating') {
      this.playPendingTurn();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeEvents?.();
      this.unsubscribePreviewSetting?.();
      this.preview.clear();
      this.indicators.destroy();
      this.huds.forEach((hud) => hud.destroy());
      this.huds.clear();
      this.scale.off('resize', this.onResize, this);
      this.cameraController.destroy();
    });
  }

  private onResize(): void {
    if (!this.cameraController.userMoved) {
      this.recenterOnPlayer();
    }
  }

  /** Keeps avatars on their ships and edge indicators on off-screen ones. */
  update(): void {
    if (!this.client || !this.cameraController) {
      return;
    }
    const camera = this.cameras.main;
    const zoom = camera.zoom;
    const view = this.client.getView();
    const styles = assignTeamStyles(view);
    const targets: IndicatorTarget[] = [];

    for (const player of Object.values(view.players)) {
      const ship = this.views.get(player.shipId) as
        | Phaser.GameObjects.Container
        | undefined;
      const hud = this.huds.get(player.shipId);
      if (!ship || ship.alpha <= 0) {
        hud?.setVisible(false);
        continue;
      }

      // Avatar floats just above the ship's bow, at a constant screen size.
      hud?.setVisible(true);
      hud?.place(ship.x, ship.y - TILE_SIZE * 0.5 - 20 / zoom, zoom);

      targets.push({
        id: player.shipId,
        x: ship.x,
        y: ship.y,
        glyph: avatarGlyph(player.name),
        color: styles.get(player.teamId)?.color ?? 0xffffff,
      });
    }

    this.indicators.update(camera, targets, this.cameraController.getInsets());
  }

  recenterOnPlayer(): void {
    // The scene may be queried before create() has run (e.g. a recenter tap
    // while the game loop is still starting), so guard against that.
    if (!this.client) {
      return;
    }
    const view = this.client.getView();
    const player = view.ships[view.self.shipId];
    if (!player || player.hp <= 0) {
      // A sunk player spectates: look at the middle of the board instead.
      this.cameraController.recenterOn(
        (view.board.width * TILE_SIZE) / 2,
        (view.board.height * TILE_SIZE) / 2,
      );
      return;
    }
    const { x, y } = gridToWorld(player.position);
    this.cameraController.recenterOn(x, y);
  }

  /** Tells the camera how much of the top and bottom is covered by UI. */
  setInsets(insets: { top: number; bottom: number }): void {
    if (!this.cameraController) {
      return;
    }
    this.cameraController.setInsets(insets);
    // Keep the ship in the visible area until the player takes over the camera.
    if (!this.cameraController.userMoved) {
      this.recenterOnPlayer();
    }
  }

  private panToShip(shipId: string): void {
    const ship = this.views.get(shipId) as
      | Phaser.GameObjects.Container
      | undefined;
    if (ship) {
      this.cameraController.panTo(ship.x, ship.y);
    }
  }

  private refreshPreview(): void {
    this.preview.update(
      this.client.getPreviewState(),
      usePreviewSettings.getState().showPlanPreview,
    );
  }

  private drawGrid(
    state: Pick<GameView, 'board'>,
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

  /** Snaps ships, obstacles and avatars to the view (no animation in flight). */
  private syncAll(view: GameView): void {
    this.syncViews(view);
    this.refreshHuds(view, true);
  }

  /**
   * Snap views to authoritative state. Only called when no animation is in
   * flight (initial load, after a turn resolves, on restart) so ships never
   * teleport mid-animation.
   */
  private syncViews(state: GameView): void {
    const styles = assignTeamStyles(state);
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
        const style = styles.get(ship.teamId) ?? [...styles.values()][0];
        this.views.register(ship.id, createShipView(this, ship, style));
      }
    }

    for (const obstacle of Object.values(state.obstacles)) {
      if (!this.views.has(obstacle.id)) {
        this.views.register(obstacle.id, createObstacleView(this, obstacle));
      }
    }
  }

  /**
   * Creates and updates the avatar over each ship. Hull pips only follow the
   * view when no animation is in flight (`syncHull`); during a turn they change
   * as the damage events play, so they never run ahead of the fight.
   */
  private refreshHuds(view: GameView, syncHull: boolean): void {
    const styles = assignTeamStyles(view);
    const planning = view.status === 'planning';

    for (const player of Object.values(view.players)) {
      const ship = view.ships[player.shipId];
      if (!ship) {
        continue;
      }
      if (ship.hp <= 0) {
        if (syncHull) {
          this.removeHud(player.shipId);
        }
        continue;
      }

      const isViewer = player.id === view.viewerId;
      const info = {
        glyph: avatarGlyph(player.name),
        color: styles.get(player.teamId)?.color ?? 0xffffff,
        // Others' busyness while planning; you can see your own plan directly.
        activity: !isViewer && planning ? player.activity : null,
        lockedIn: planning && player.lockedIn,
        isViewer,
      };

      const existing = this.huds.get(player.shipId);
      if (existing) {
        existing.setInfo(
          syncHull ? { ...info, hull: ship.hp, maxHull: ship.maxHp } : info,
        );
      } else {
        this.huds.set(
          player.shipId,
          new ShipHudView(this, {
            ...info,
            hull: ship.hp,
            maxHull: ship.maxHp,
          }),
        );
      }
    }

    this.indicators.retain(new Set(this.huds.keys()));
  }

  private removeHud(shipId: string): void {
    this.huds.get(shipId)?.destroy();
    this.huds.delete(shipId);
    this.indicators?.retain(new Set(this.huds.keys()));
  }

  private onSnapshot(snapshot: ClientSnapshot): void {
    const view = snapshot.view;
    if (view.status === 'planning' || view.status === 'game_over') {
      this.syncAll(view);
    } else {
      this.refreshHuds(view, false);
    }
    this.preview?.update(
      this.client.getPreviewState(),
      usePreviewSettings.getState().showPlanPreview,
    );
  }

  private onEvent = (event: GameEvent): void => {
    this.buffer.push(event);
    if (event.type !== 'TURN_ENDED') {
      return;
    }

    const batch = this.buffer;
    this.buffer = [];
    void this.animator.play(batch).then(() => {
      this.client.acknowledgeTurn();
      this.syncAll(this.client.getView());
    });
  };

  /** Replays a turn whose events were emitted before this scene subscribed. */
  private playPendingTurn(): void {
    const pending = this.client.getPendingEvents();
    if (!pending) {
      return;
    }
    void this.animator.play(pending).then(() => {
      this.client.acknowledgeTurn();
      this.syncAll(this.client.getView());
    });
  }
}
