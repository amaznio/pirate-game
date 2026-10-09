import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { TILE_SIZE } from '../Grid';

/**
 * Generates lightweight placeholder textures so the game runs from a clean
 * checkout with no external art. Replace the body of these methods with
 * Scallywag sprite loads later; keys in AssetKeys stay the same.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.createWater();
    this.createShip(AssetKeys.shipPlayer, 0x4a7fb5, 0xe8d9b5);
    this.createShip(AssetKeys.shipEnemy, 0xc07a3e, 0x2b2018);
    this.createRock();
    this.createIsland();
    this.createDot(AssetKeys.projectile, 0x2b2018, 10);
    this.createDot(AssetKeys.flash, 0xffcf66, 22);
    this.createDot(AssetKeys.splash, 0xbfe3ef, 26);
    this.scene.start('BattleScene');
  }

  private createWater(): void {
    const g = this.add.graphics();
    g.fillStyle(0x12333f, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.lineStyle(2, 0x1c4a57, 0.7);
    g.beginPath();
    g.moveTo(8, 14);
    g.lineTo(24, 14);
    g.strokePath();
    g.beginPath();
    g.moveTo(24, 32);
    g.lineTo(40, 32);
    g.strokePath();
    g.generateTexture(AssetKeys.water, TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private createShip(key: string, hull: number, deck: number): void {
    const size = TILE_SIZE - 8;
    const g = this.add.graphics();
    g.fillStyle(hull, 1);
    g.beginPath();
    g.moveTo(2, 2);
    g.lineTo(size, size / 2);
    g.lineTo(2, size - 2);
    g.closePath();
    g.fillPath();
    g.fillStyle(deck, 1);
    g.fillCircle(size * 0.38, size / 2, size * 0.12);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private createRock(): void {
    const g = this.add.graphics();
    g.fillStyle(0x5b6670, 1);
    g.fillCircle(24, 24, 18);
    g.fillStyle(0x424b54, 1);
    g.fillCircle(18, 20, 10);
    g.generateTexture(AssetKeys.rock, TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private createIsland(): void {
    const g = this.add.graphics();
    g.fillStyle(0xcbb587, 1);
    g.fillCircle(24, 24, 20);
    g.fillStyle(0x4f9d69, 1);
    g.fillCircle(24, 22, 12);
    g.fillStyle(0x3d7d52, 1);
    g.fillCircle(18, 26, 6);
    g.generateTexture(AssetKeys.island, TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private createDot(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
