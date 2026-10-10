import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { generateTerrainTextures } from '../assets/terrainTextures';
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
  }

  create(): void {
    generateTerrainTextures(this);
    this.scene.start('BattleScene');
  }
}
