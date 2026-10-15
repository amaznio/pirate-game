import Phaser from 'phaser';
import { vectorFor, type Direction } from '@pirate/game-core/domain/Direction';
import { EXIT_DEPTH } from '@pirate/game-core/domain/Objective';
import type { GameView } from '@pirate/game-core/view/GameView';
import type { ClientSnapshot, GameClient } from '@pirate/game-core/client/GameClient';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import { assignTeamStyles, avatarGlyph } from '../../presentation/teamStyle';
import { AssetKeys, TileFrames } from '../assets/AssetKeys';
import { TILE_SIZE, WORLD_MARGIN_TILES, gridToWorld } from '../Grid';
import { EntityViewRegistry } from '../views/EntityViewRegistry';
import { createShipView, headingToAngle, hudLift, setShipHull } from '../views/ShipView';
import { ScallywagKeys, WATER_TILES, waterTileFrameName } from '../assets/scallywag';
import { currentArtStyle, currentSeaMode, currentWaterStyle } from '../../presentation/artStyle';
import { hashText } from '../assets/seaPixels';
import { SeaView } from '../views/SeaView';
import { SurfView } from '../views/SurfView';
import { seaLookFor } from '../assets/seaLook';
import { createObstacleView } from '../views/ObstacleView';
import { createTerrainViews } from '../views/TerrainView';
import { ShipHudView } from '../views/ShipHudView';
import {
  OffscreenIndicators,
  type IndicatorTarget,
} from '../views/OffscreenIndicators';
import { EventAnimator } from '../animation/EventAnimator';
import { BattleCameraController } from '../camera/BattleCameraController';
import { PlanPreviewView } from '../views/PlanPreviewView';
import { PickupField } from '../views/PickupField';
import { MonsterField } from '../views/MonsterField';
import { usePreviewSettings } from '../../store/previewSettings';
import { getPhaserContext } from '../PhaserGame';
import { pixelRatio } from '../pixelRatio';

export class BattleScene extends Phaser.Scene {
  private views!: EntityViewRegistry;
  private animator!: EventAnimator;
  private cameraController!: BattleCameraController;
  private preview!: PlanPreviewView;
  private pickups!: PickupField;
  private monsters!: MonsterField;
  /** The pixel-art sea, when it is drawn (it drifts a little every frame). */
  private sea: SeaView | null = null;
  /** Foam round the rocks, with the pixel art. */
  private surf: SurfView | null = null;
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

    // The water extends past the board as a purely decorative margin (the
    // playable area is still board.width x board.height). It runs on far enough
    // that the camera can be dragged any way on a window bigger than the board.
    const pixelArt = currentArtStyle() === 'scallywag';
    const margin = WORLD_MARGIN_TILES * TILE_SIZE;
    if (pixelArt) {
      this.addPixelWater(state, -margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);
    } else {
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
    }
    this.drawGrid(state, worldWidth, worldHeight, margin);
    if (pixelArt) {
      this.surf = new SurfView(
        this,
        Object.values(state.obstacles),
        this.sea?.direction ?? [1, 0],
        seaLookFor(state.sea),
      );
    }
    createTerrainViews(this, state.terrain);
    this.drawExit(state, worldWidth, worldHeight);
    this.pickups = new PickupField(this);
    this.monsters = new MonsterField(this);

    this.views = new EntityViewRegistry();
    this.animator = new EventAnimator(this, this.views, {
      onDamage: (shipId, hp) => {
        this.huds.get(shipId)?.setInfo({ hull: hp });
        this.showDamage(shipId, hp);
      },
      onDestroyed: (shipId) => this.removeHud(shipId),
      onPickup: (event) => this.pickups.collect(event),
      onMonsterMoved: (event) => this.monsters.moved(event),
      onMonsterAttack: (event) => this.monsters.attack(event),
      onMonsterDamaged: (event) => this.monsters.hurt(event),
      onMonsterDestroyed: (event) => this.monsters.destroyed(event),
      onEscaped: (shipId) => this.removeHud(shipId),
      exitDirection: () => {
        const objective = this.client.getView().objective;
        return objective?.kind === 'merchant' || objective?.kind === 'hunt' ? objective.exit : undefined;
      },
    });
    this.cameraController = new BattleCameraController(this, worldWidth, worldHeight, {
      pixelSteps: currentArtStyle() === 'scallywag',
      reach: margin,
      pixelRatio: pixelRatio(),
    });
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
      this.pickups.destroy();
      this.monsters.destroy();
      this.indicators.destroy();
      this.huds.forEach((hud) => hud.destroy());
      this.huds.clear();
      this.scale.off('resize', this.onResize, this);
      this.cameraController.destroy();
    });
  }

  /**
   * The sea in the pixel-art style: layered, drifting and never the same two
   * cells over (`SeaView`), or the pack's own six water tiles in turn
   * (`?water=pack`). The seed comes from the board's rocks and hazards, so every
   * player sees the same sea for the same board.
   */
  private addPixelWater(
    state: GameView,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (currentWaterStyle() === 'calm') {
      const board = [
        ...Object.values(state.obstacles).map((o) => `${o.position.x},${o.position.y}`),
        ...Object.keys(state.terrain),
      ].sort();
      this.sea = new SeaView(this, { x, y, width, height }, hashText(`${state.board.width}x${state.board.height}|${board.join(';')}`), currentSeaMode(), {
        board: { x: 0, y: 0, width: state.board.width * TILE_SIZE, height: state.board.height * TILE_SIZE },
        rocks: Object.values(state.obstacles).map((o) => gridToWorld(o.position)),
        // Each whirlpool is four cells; its middle is where the four meet.
        whirlpools: Object.entries(state.terrain)
          .filter(([, cell]) => cell.kind === 'whirlpool' && cell.corner === 'topLeft')
          .map(([key]) => {
            const [cx, cy] = key.split(',').map(Number);
            const corner = gridToWorld({ x: cx, y: cy });
            return { x: corner.x + TILE_SIZE / 2, y: corner.y + TILE_SIZE / 2 };
          }),
      }, seaLookFor(state.sea));
      return;
    }
    const water = this.add
      .tileSprite(x, y, width, height, ScallywagKeys.water, waterTileFrameName(0))
      .setOrigin(0)
      .setDepth(0)
      .setTileScale(2, 2);
    let tile = 0;
    this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        tile = (tile + 1) % WATER_TILES;
        water.setFrame(waterTileFrameName(tile));
      },
    });
  }

  private onResize(): void {
    if (!this.cameraController.userMoved) {
      this.recenterOnPlayer();
    }
  }

  /** Keeps avatars on their ships and edge indicators on off-screen ones. */
  update(time: number, delta: number): void {
    this.sea?.update(delta);
    this.surf?.update(time, delta);
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
      const lift = view.ships[player.shipId] ? hudLift(view.ships[player.shipId]) : TILE_SIZE * 0.5;
      // Screen-space sizes are in CSS pixels; the canvas is in device pixels.
      const ui = pixelRatio();
      hud?.place(ship.x, ship.y - lift - (20 * ui) / zoom, zoom / ui);

      targets.push({
        id: player.shipId,
        x: ship.x,
        y: ship.y,
        glyph: avatarGlyph(player.name),
        color: styles.get(player.teamId)?.color ?? 0xffffff,
      });
    }

    this.indicators.update(camera, targets, this.cameraController.getInsets(), pixelRatio());
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
    // The pixel art keeps the grid fainter: it is a lot to look at on a calm sea.
    g.lineStyle(1, 0x0d3b49, currentArtStyle() === 'scallywag' ? 0.28 : 0.5);
    for (let x = 0; x <= state.board.width; x += 1) {
      g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, worldHeight);
    }
    for (let y = 0; y <= state.board.height; y += 1) {
      g.lineBetween(0, y * TILE_SIZE, worldWidth, y * TILE_SIZE);
    }
  }

  /**
   * In a merchant match, marks the edge the merchant is making for: a pale gold
   * strip along the edge with an arrow in every cell pointing off the board.
   */
  private drawExit(state: GameView, worldWidth: number, worldHeight: number): void {
    const objective = state.objective;
    if (objective?.kind === 'hunt' && objective.exit) {
      this.drawShallows(state, objective.exit, worldWidth, worldHeight);
      return;
    }
    if (objective?.kind !== 'merchant' || !objective.exit) {
      return;
    }
    const g = this.add.graphics().setDepth(2);
    const colour = 0xf2c14e;
    const way = vectorFor(objective.exit);
    const horizontal = way.x !== 0;
    const strip = TILE_SIZE;
    const x0 = way.x > 0 ? worldWidth - strip : 0;
    const y0 = way.y > 0 ? worldHeight - strip : 0;
    g.fillStyle(colour, 0.16);
    g.fillRect(x0, y0, horizontal ? strip : worldWidth, horizontal ? worldHeight : strip);

    const cells = horizontal ? state.board.height : state.board.width;
    g.fillStyle(colour, 0.55);
    for (let i = 0; i < cells; i += 1) {
      // The middle of this cell of the strip, and an arrow of three points round it.
      const cx = horizontal ? x0 + strip / 2 : (i + 0.5) * TILE_SIZE;
      const cy = horizontal ? (i + 0.5) * TILE_SIZE : y0 + strip / 2;
      const size = 10;
      const tip = { x: cx + way.x * size, y: cy + way.y * size };
      const left = { x: cx - way.x * size + way.y * size, y: cy - way.y * size - way.x * size };
      const right = { x: cx - way.x * size - way.y * size, y: cy - way.y * size + way.x * size };
      g.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }
  }

  /**
   * In a hunt, the exit area: the outer rows along the exit edge turn to pale
   * turquoise shallows with a slow shimmer, a row of buoys along the inner edge
   * and chevrons pointing off the board. Ships that end a turn here may leave.
   */
  private drawShallows(state: GameView, exit: Direction, worldWidth: number, worldHeight: number): void {
    const way = vectorFor(exit);
    const horizontal = way.x !== 0;
    const depth = EXIT_DEPTH * TILE_SIZE;
    const x0 = way.x > 0 ? worldWidth - depth : 0;
    const y0 = way.y > 0 ? worldHeight - depth : 0;
    const w = horizontal ? depth : worldWidth;
    const h = horizontal ? worldHeight : depth;

    const shallows = this.add.graphics().setDepth(2);
    shallows.fillStyle(0x8fe6d8, 0.32);
    shallows.fillRect(x0, y0, w, h);
    // A lighter band at the edge, where the water is shallowest.
    shallows.fillStyle(0xd8fff4, 0.2);
    shallows.fillRect(
      way.x > 0 ? worldWidth - TILE_SIZE * 0.5 : way.x < 0 ? 0 : x0,
      way.y > 0 ? worldHeight - TILE_SIZE * 0.5 : way.y < 0 ? 0 : y0,
      horizontal ? TILE_SIZE * 0.5 : w,
      horizontal ? h : TILE_SIZE * 0.5,
    );
    this.tweens.add({ targets: shallows, alpha: 0.65, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const marks = this.add.graphics().setDepth(3);
    const cells = horizontal ? state.board.height : state.board.width;
    // Buoys along the inner edge of the area, one every third cell.
    const inner = horizontal
      ? way.x > 0 ? x0 : x0 + depth
      : way.y > 0 ? y0 : y0 + depth;
    for (let i = 1; i < cells; i += 3) {
      const along = (i + 0.5) * TILE_SIZE;
      const bx = horizontal ? inner : along;
      const by = horizontal ? along : inner;
      marks.fillStyle(0xffffff, 0.95);
      marks.fillCircle(bx, by, 6);
      marks.fillStyle(0xe5533d, 1);
      marks.fillCircle(bx, by - 2, 4);
      marks.fillStyle(0xffffff, 0.9);
      marks.fillRect(bx - 3, by - 1, 6, 2);
    }
    // Chevrons pointing off the board, every other cell along the outer row.
    marks.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < cells; i += 2) {
      const cx = horizontal ? x0 + depth - TILE_SIZE * (way.x > 0 ? 0.5 : 1.5) : (i + 0.5) * TILE_SIZE;
      const cy = horizontal ? (i + 0.5) * TILE_SIZE : y0 + depth - TILE_SIZE * (way.y > 0 ? 0.5 : 1.5);
      const size = 9;
      marks.fillTriangle(
        cx + way.x * size,
        cy + way.y * size,
        cx - way.x * size + way.y * size,
        cy - way.y * size - way.x * size,
        cx - way.x * size - way.y * size,
        cy - way.y * size + way.x * size,
      );
    }
  }

  /** A ring that opens where a ship arrives, and the ship fading in. */
  private announceArrival(
    view: Phaser.GameObjects.Container,
    position: { x: number; y: number },
  ): void {
    const { x, y } = gridToWorld(position);
    view.setAlpha(0);
    this.tweens.add({ targets: view, alpha: 1, duration: 700, ease: 'Sine.easeOut' });
    const ring = this.add.circle(x, y, TILE_SIZE * 0.3).setStrokeStyle(4, 0xf2c14e, 0.9).setDepth(60);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
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
    this.pickups.sync(state.pickups);
    this.monsters.sync(state.monsters);
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
        setShipHull(existing, ship.hp, ship.maxHp);
      } else {
        const style = styles.get(ship.teamId) ?? [...styles.values()][0];
        const created = createShipView(this, ship, style, { isViewer: ship.ownerId === state.viewerId });
        this.views.register(ship.id, created);
        // A ship that turns up after the match began (a raider arriving) fades in under a ring.
        if (state.turn > 1) {
          this.announceArrival(created as Phaser.GameObjects.Container, ship.position);
        }
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

  /** Shows a ship's damage step as its damage event plays. */
  private showDamage(shipId: string, hp: number): void {
    const view = this.views.get(shipId) as Phaser.GameObjects.Container | undefined;
    const ship = this.client.getView().ships[shipId];
    if (view && ship && hp > 0) {
      setShipHull(view, hp, ship.maxHp);
    }
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
