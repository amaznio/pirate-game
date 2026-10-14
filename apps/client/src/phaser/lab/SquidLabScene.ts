import Phaser from 'phaser';
import { ScallywagKeys, registerShipFrames } from '../assets/scallywag';
import {
  GIANT_SQUID_KEY,
  GIANT_SQUID_PATH,
  SQUID_DEATH_FRAMES,
  SQUID_HURT_FRAMES,
  SQUID_IDLE_FRAMES,
  SQUID_WHIP_FRAMES,
  registerGiantSquidFrames,
  squidFrame,
} from '../assets/giantSquid';
import { useCrispFiltering } from '../assets/crispTextures';
import { SHIP_LOOKS, createScallywagShip } from '../views/scallywagShip';
import { SHIP_TYPES, cannonsPerSideOf } from '@pirate/game-core/config/shipTypes';

/**
 * Art lab for the giant squid (open `?lab=squid`): every frame of the sheet in a
 * row, and the squid beside the real ships at game scale. The real thing is
 * `MonsterField`; this is for judging the pictures. Throwaway, like the art lab.
 */
export class SquidLabScene extends Phaser.Scene {
  constructor() {
    super('SquidLabScene');
  }

  preload(): void {
    this.load.image(ScallywagKeys.ships, 'assets/scallywag/ships.png');
    this.load.image(GIANT_SQUID_KEY, GIANT_SQUID_PATH);
  }

  create(): void {
    registerShipFrames(this.textures);
    registerGiantSquidFrames(this.textures);
    useCrispFiltering(this.textures);

    this.cameras.main.setBackgroundColor('#1c85d9');
    this.cameras.main.setZoom(Number(new URLSearchParams(window.location.search).get('zoom') ?? 1.5));
    this.cameras.main.centerOn(256, 150);

    const label = (x: number, y: number, text: string) =>
      this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setResolution(4);

    // Row 1: the idle frames, the two hurt frames, then ships for scale.
    label(4, 2, 'idle x4, hurt x2');
    for (let i = 0; i < SQUID_IDLE_FRAMES; i += 1) {
      this.add.image(40 + i * 72, 80, GIANT_SQUID_KEY, squidFrame.idle(i));
    }
    for (let i = 0; i < SQUID_HURT_FRAMES; i += 1) {
      this.add.image(40 + (SQUID_IDLE_FRAMES + i) * 72, 80, GIANT_SQUID_KEY, squidFrame.hurt(i));
    }
    (['sloop', 'brigantine', 'galleon'] as const).forEach((id, i) => {
      createScallywagShip(
        this,
        { look: SHIP_LOOKS[id], hullColour: 0, sailColour: [4, 5, 2][i], state: 'intact', cannons: cannonsPerSideOf(SHIP_TYPES[id]) },
        470 + i * 60,
        80,
      );
    });

    // Row 2: the whip, then the death frames.
    label(4, 160, 'whip x6');
    for (let i = 0; i < SQUID_WHIP_FRAMES; i += 1) {
      this.add.image(52 + i * 100, 200, GIANT_SQUID_KEY, squidFrame.whip(i));
    }
    label(4, 250, 'death x5');
    for (let i = 0; i < SQUID_DEATH_FRAMES; i += 1) {
      this.add.image(52 + i * 100, 320, GIANT_SQUID_KEY, squidFrame.death(i));
    }
  }
}
