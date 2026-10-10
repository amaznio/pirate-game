import Phaser from 'phaser';
import type { Direction } from '@pirate/game-core/domain/Direction';
import { vectorFor } from '@pirate/game-core/domain/Direction';
import type { TerrainMap } from '@pirate/game-core/domain/Terrain';
import { TerrainTextures } from '../assets/terrainTextures';
import { TILE_SIZE, gridToWorld } from '../Grid';

/** Rotation that turns the EAST-pointing chevrons toward a direction. */
const WIND_ANGLE: Record<Direction, number> = {
  EAST: 0,
  SOUTH: Math.PI / 2,
  WEST: Math.PI,
  NORTH: -Math.PI / 2,
};

/** Drawn above the water and grid, below rocks, ghosts and ships. */
const TERRAIN_DEPTH = 2;
const WIND_PERIOD = 1300;
/** How far, along the wind, a chevron drifts in one period (pixels). */
const WIND_DRIFT = 22;

function addWind(
  scene: Phaser.Scene,
  x: number,
  y: number,
  direction: Direction,
): void {
  const center = gridToWorld({ x, y });
  const delta = vectorFor(direction);

  // A pale wash so a lane of wind reads as one belt.
  scene.add
    .rectangle(center.x, center.y, TILE_SIZE - 4, TILE_SIZE - 4, 0xcdeeff, 0.1)
    .setDepth(TERRAIN_DEPTH);

  const chevrons = scene.add
    .image(center.x - delta.x * WIND_DRIFT * 0.5, center.y - delta.y * WIND_DRIFT * 0.5, TerrainTextures.wind)
    .setDepth(TERRAIN_DEPTH)
    .setRotation(WIND_ANGLE[direction])
    .setAlpha(0);

  // Cells further along the lane start later, so the gust travels down it.
  const along = x * delta.x + y * delta.y;
  const delay = (((along % 6) + 6) % 6) * 140;

  scene.tweens.add({
    targets: chevrons,
    x: center.x + delta.x * WIND_DRIFT * 0.5,
    y: center.y + delta.y * WIND_DRIFT * 0.5,
    duration: WIND_PERIOD,
    delay,
    repeat: -1,
  });
  scene.tweens.add({
    targets: chevrons,
    alpha: 0.85,
    duration: WIND_PERIOD / 2,
    delay,
    yoyo: true,
    repeat: -1,
  });
}

function addWhirlpool(
  scene: Phaser.Scene,
  anchorX: number,
  anchorY: number,
  clockwise: boolean,
): void {
  // The centre of the 2x2 block, where its four cells meet.
  const topLeft = gridToWorld({ x: anchorX, y: anchorY });
  const x = topLeft.x + TILE_SIZE / 2;
  const y = topLeft.y + TILE_SIZE / 2;

  const swirl = scene.add
    .image(x, y, clockwise ? TerrainTextures.whirlpoolRight : TerrainTextures.whirlpoolLeft)
    .setDepth(TERRAIN_DEPTH)
    .setDisplaySize(TILE_SIZE * 2 - 6, TILE_SIZE * 2 - 6);

  scene.tweens.add({
    targets: swirl,
    angle: clockwise ? 360 : -360,
    duration: 5200,
    repeat: -1,
  });
}

/**
 * Draws the wind lanes and whirlpools. Terrain never changes during a match,
 * so this runs once; the tweens that keep it moving belong to the scene and go
 * away with it.
 */
export function createTerrainViews(scene: Phaser.Scene, terrain: TerrainMap): void {
  for (const [key, cell] of Object.entries(terrain)) {
    const [x, y] = key.split(',').map(Number);
    if (cell.kind === 'wind') {
      addWind(scene, x, y, cell.direction);
    } else if (cell.corner === 'topLeft') {
      addWhirlpool(scene, x, y, cell.spin === 'right');
    }
  }
}
