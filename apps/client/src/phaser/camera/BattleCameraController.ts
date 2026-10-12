import Phaser from 'phaser';
import { TILE_SIZE } from '../Grid';
import { allowedSteps, snapToStep, stepFrom, zoomSteps } from './zoomSteps';

const MAX_ZOOM = 2.5;

/** Wheel movement that counts as one step when zooming in whole steps. */
const WHEEL_PER_STEP = 60;

export interface CameraOptions {
  /**
   * Zoom only in whole-pixel steps (see zoomSteps.ts), and keep the camera on
   * whole pixels, so pixel art stays crisp. Off for the smooth Kenney art.
   */
  readonly pixelSteps?: boolean;
}

/** How far past the board edge the camera may pan (world pixels). */
export const CAMERA_PAD = TILE_SIZE * 2;

/**
 * Mobile-first map-style camera controls: one-finger drag to pan, pinch to
 * zoom, wheel to zoom on desktop. The camera is clamped to the board bounds
 * via setBounds so the player can never wander into empty space.
 */
export class BattleCameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  /** Screen pixels at the top and bottom covered by UI (HUD, planning sheet). */
  private insets = { top: 0, bottom: 0 };
  /** True once the player has panned or zoomed themselves. */
  userMoved = false;
  /** Where a pinch has taken the zoom, before it is snapped to a step. */
  private rawZoom = 1;
  private wheelTravel = 0;
  private readonly pixelSteps: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    options: CameraOptions = {},
  ) {
    this.pixelSteps = options.pixelSteps ?? false;
    this.camera = scene.cameras.main;
    this.camera.roundPixels = this.pixelSteps;
    this.applyBounds();
    scene.scale.on('resize', this.refit, this);
    this.refit();
    scene.input.addPointer(2);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
    scene.input.on('wheel', this.onWheel, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.pointers.delete(pointer.id);
    if (this.pointers.size < 2) {
      this.pinchDistance = 0;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const previous = this.pointers.get(pointer.id);
    if (!previous) {
      return;
    }
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    this.userMoved = true;

    const active = [...this.pointers.values()];
    if (active.length >= 2) {
      const distance = Phaser.Math.Distance.Between(
        active[0].x,
        active[0].y,
        active[1].x,
        active[1].y,
      );
      if (this.pinchDistance > 0) {
        // Follow the fingers smoothly underneath and show the nearest step.
        this.setZoom(this.rawZoom * (distance / this.pinchDistance));
      }
      this.pinchDistance = distance;
      return;
    }

    this.camera.scrollX -= (pointer.x - previous.x) / this.camera.zoom;
    this.camera.scrollY -= (pointer.y - previous.y) / this.camera.zoom;
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _objects: unknown,
    _deltaX: number,
    deltaY: number,
  ): void {
    this.userMoved = true;
    if (this.pixelSteps) {
      // A wheel notch (or a burst of trackpad movement) is a step, not a slide.
      this.wheelTravel += deltaY;
      if (Math.abs(this.wheelTravel) >= WHEEL_PER_STEP) {
        const direction = this.wheelTravel > 0 ? -1 : 1;
        this.wheelTravel = 0;
        this.setZoom(stepFrom(this.camera.zoom, this.steps(), direction));
      }
      return;
    }
    this.setZoom(this.camera.zoom * (deltaY > 0 ? 0.9 : 1.1));
  }

  /** Zoom at which the padded board exactly covers the viewport. */
  private fitZoom(): number {
    return Math.max(
      this.camera.width / (this.worldWidth + CAMERA_PAD * 2),
      this.camera.height / (this.worldHeight + CAMERA_PAD * 2),
    );
  }

  /** The zoom steps the board still fills the screen at (pixel-art mode). */
  private steps(): number[] {
    return allowedSteps(zoomSteps(), this.fitZoom(), MAX_ZOOM);
  }

  /** The smallest zoom allowed: the board must fill the viewport. */
  private minZoom(): number {
    return this.pixelSteps ? this.steps()[0] : Math.min(this.fitZoom(), MAX_ZOOM);
  }

  /** Re-applies the zoom floor after the viewport changes size. */
  private refit(): void {
    this.setZoom(this.camera.zoom);
  }

  setZoom(zoom: number): void {
    const clamped = Phaser.Math.Clamp(zoom, this.minZoom(), MAX_ZOOM);
    this.rawZoom = clamped;
    this.camera.setZoom(this.pixelSteps ? snapToStep(clamped, this.steps()) : clamped);
    this.applyBounds();
  }

  /**
   * The camera may scroll a little past the board, and far enough that any
   * edge of the board can be brought into the part of the screen that is not
   * covered by UI (otherwise a ship by the bottom edge could never be lifted
   * out from behind the planning sheet).
   */
  private applyBounds(): void {
    const zoom = this.camera ? this.camera.zoom : 1;
    const top = this.insets.top / zoom;
    const bottom = this.insets.bottom / zoom;
    this.camera.setBounds(
      -CAMERA_PAD,
      -CAMERA_PAD - top,
      this.worldWidth + CAMERA_PAD * 2,
      this.worldHeight + CAMERA_PAD * 2 + top + bottom,
    );
  }

  setInsets(insets: { top: number; bottom: number }): void {
    this.insets = {
      top: Math.max(0, insets.top),
      bottom: Math.max(0, insets.bottom),
    };
    this.applyBounds();
  }

  getInsets(): { top: number; bottom: number } {
    return this.insets;
  }

  /** Vertical shift that puts a point in the middle of the uncovered screen. */
  private centreOffset(): number {
    return (this.insets.bottom - this.insets.top) / 2 / this.camera.zoom;
  }

  /** Centres a world point in the part of the screen not covered by UI. */
  recenterOn(x: number, y: number): void {
    this.camera.centerOn(x, y + this.centreOffset());
  }

  /** Smoothly brings a world point to the middle of the uncovered screen. */
  panTo(x: number, y: number): void {
    this.userMoved = true;
    this.camera.pan(x, y + this.centreOffset(), 350, 'Sine.easeInOut', true);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.scale.off('resize', this.refit, this);
  }
}
