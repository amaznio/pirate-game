import Phaser from 'phaser';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

/**
 * Mobile-first map-style camera controls: one-finger drag to pan, pinch to
 * zoom, wheel to zoom on desktop. The camera is clamped to the board bounds
 * via setBounds so the player can never wander into empty space.
 */
export class BattleCameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.camera = scene.cameras.main;
    this.camera.setBounds(0, 0, worldWidth, worldHeight);
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

    const active = [...this.pointers.values()];
    if (active.length >= 2) {
      const distance = Phaser.Math.Distance.Between(
        active[0].x,
        active[0].y,
        active[1].x,
        active[1].y,
      );
      if (this.pinchDistance > 0) {
        this.setZoom(this.camera.zoom * (distance / this.pinchDistance));
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
    this.setZoom(this.camera.zoom * (deltaY > 0 ? 0.9 : 1.1));
  }

  setZoom(zoom: number): void {
    this.camera.setZoom(Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM));
  }

  recenterOn(x: number, y: number): void {
    this.camera.centerOn(x, y);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
  }
}
