import Phaser from 'phaser';
import { AssetKeys, TileFrames } from '../assets/AssetKeys';
import { generatePixelTerrainTextures, generateTerrainTextures } from '../assets/terrainTextures';
import {
  ScallywagKeys,
  registerShipFrames,
  registerWaterFrames,
} from '../assets/scallywag';
import { useCrispFiltering } from '../assets/crispTextures';
import { currentArtStyle } from '../../presentation/artStyle';
import { TILE_SIZE } from '../Grid';

/**
 * Loads the Kenney Pirate Pack assets (CC0) and starts the battle. Files live
 * in public/assets/kenney/ and are served at the web root by Vite.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.spritesheet(AssetKeys.tiles, 'assets/kenney/tiles_sheet.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
    });
    this.load.atlasXML(
      AssetKeys.ships,
      'assets/kenney/shipsMiscellaneous_sheet.png',
      'assets/kenney/shipsMiscellaneous_sheet.xml',
    );
    if (currentArtStyle() === 'scallywag') {
      this.load.image(ScallywagKeys.ships, 'assets/scallywag/ships.png');
      this.load.image(ScallywagKeys.water, 'assets/scallywag/water-islands.png');
    }
  }

  create(): void {
    generateTerrainTextures(this);
    this.makeRockTexture();
    if (currentArtStyle() === 'scallywag') {
      registerShipFrames(this.textures);
      registerWaterFrames(this.textures);
      generatePixelTerrainTextures(this);
      useCrispFiltering(this.textures);
    }
    this.scene.start('BattleScene');
  }

  /**
   * Copies the rock out of the terrain sheet, a few pixels in from the tile's
   * edge, onto a transparent canvas. Drawn from a sheet frame, a rotated rock
   * shows thin lines of the neighbouring tiles; from this copy it cannot.
   */
  private makeRockTexture(): void {
    const frame = this.textures.getFrame(AssetKeys.tiles, TileFrames.rock);
    const canvas = this.textures.createCanvas(AssetKeys.rock, TILE_SIZE, TILE_SIZE);
    const context = canvas?.getContext();
    if (!frame || !canvas || !context) {
      return;
    }
    const inset = 3;
    const size = TILE_SIZE - inset * 2;
    context.drawImage(
      frame.source.image as CanvasImageSource,
      frame.cutX + inset,
      frame.cutY + inset,
      size,
      size,
      inset,
      inset,
      size,
      size,
    );
    canvas.refresh();
  }
}
