import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  FX_FRAMES,
  HULL_STATES,
  ScallywagKeys,
  fxFrameName,
  registerShipFrames,
  wakeFrameName,
} from '../assets/scallywag';
import { attachWake } from '../animation/animateWake';
import { useCrispFiltering } from '../assets/crispTextures';
import { headingToAngle } from '../views/ShipView';
import { SHIP_LOOKS, createScallywagShip, setScallywagHull } from '../views/scallywagShip';
import { animateDestroyed } from '../animation/animateDestroyed';
import { SHIP_TYPES, cannonsPerSideOf } from '@pirate/game-core/config/shipTypes';
import type { Direction } from '@pirate/game-core/domain/Direction';

const CELL = 64;
const CLASSES = ['sloop', 'brigantine', 'galleon'] as const;
const SAIL_FOR_TEAM = [4, 5, 2];

/**
 * A throwaway scene for judging the Scallywag art by eye (open `?lab=art`):
 * the three ship classes beside the Kenney ship they replace, with the 64 px
 * cell each one sails in, their damage steps, the four headings, and the
 * terrain sheet. It is not part of the game.
 */
export class ArtLabScene extends Phaser.Scene {
  constructor() {
    super('ArtLabScene');
  }

  preload(): void {
    this.load.image(ScallywagKeys.ships, 'assets/scallywag/ships.png');
    this.load.image(ScallywagKeys.water, 'assets/scallywag/water-islands.png');
    this.load.atlasXML(
      AssetKeys.ships,
      'assets/kenney/shipsMiscellaneous_sheet.png',
      'assets/kenney/shipsMiscellaneous_sheet.xml',
    );
  }

  create(): void {
    registerShipFrames(this.textures);
    useCrispFiltering(this.textures);

    this.cameras.main.setBackgroundColor('#1e7fd6');
    this.cameras.main.setZoom(1.6);
    this.cameras.main.centerOn(330, 185);

    const label = (x: number, y: number, text: string) =>
      this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '7px', color: '#ffffff' }).setResolution(4);

    const cell = (x: number, y: number) =>
      this.add.rectangle(x, y, CELL, CELL).setStrokeStyle(0.5, 0xffffff, 0.45).setFillStyle(0xffffff, 0.04);

    // Row 1: the Kenney ship now, and the three classes in their cells.
    label(8, 6, 'now (Kenney)');
    for (let i = 0; i < 3; i += 1) {
      const x = 40 + i * 70;
      cell(x, 50);
      this.add.image(x, 50, AssetKeys.ships, ['ship (5).png', 'ship (3).png', 'ship (4).png'][i]).setScale(0.55);
    }

    label(240, 6, 'Scallywag: sloop, brigantine, galleon (cell = 64 px)');
    CLASSES.forEach((id, i) => {
      const x = 272 + i * 90;
      cell(x, 50);
      const ship = createScallywagShip(this, {
        look: SHIP_LOOKS[id],
        hullColour: 0,
        sailColour: SAIL_FOR_TEAM[i],
        state: 'intact',
        cannons: cannonsPerSideOf(SHIP_TYPES[id]),
      }, 0, 0, { outline: [0x4f86c6, 0xc94f4f, 0x4f9d69][i] });
      ship.setPosition(x, 50);
      attachWake(this, ship);
    });

    // Row 2: every damage step of each class.
    label(8, 100, 'intact, damaged, broken (hull points pick the step)');
    CLASSES.forEach((id, i) => {
      HULL_STATES.forEach((state, j) => {
        const x = 30 + i * 215 + j * 62;
        cell(x, 150);
        createScallywagShip(
          this,
          { look: SHIP_LOOKS[id], hullColour: i, sailColour: SAIL_FOR_TEAM[i], state, cannons: cannonsPerSideOf(SHIP_TYPES[id]) },
          x,
          150,
        );
      });
    });

    // Row 3: the four headings of a galleon.
    label(8, 190, 'headings (bow down at rotation 0)');
    (['NORTH', 'EAST', 'SOUTH', 'WEST'] as Direction[]).forEach((heading, i) => {
      const x = 40 + i * 70;
      cell(x, 240);
      const ship = createScallywagShip(
        this,
        { look: SHIP_LOOKS.galleon, hullColour: 3, sailColour: 4, state: 'intact', cannons: 3 },
        x,
        240,
      );
      ship.setRotation(headingToAngle(heading));
      label(x - 14, 276, heading);
    });

    // Hull colours of the medium hull.
    label(320, 190, 'hull colours (and a grey wreck)');
    for (let colour = 0; colour < 5; colour += 1) {
      createScallywagShip(
        this,
        { look: SHIP_LOOKS.brigantine, hullColour: colour, sailColour: colour + 1, state: 'intact', cannons: 2 },
        338 + colour * 50,
        240,
      );
    }
    createScallywagShip(
      this,
      { look: SHIP_LOOKS.brigantine, hullColour: 'grey', sailColour: 0, state: 'intact', cannons: 2 },
      338 + 5 * 50,
      240,
    );

    // The hooks the game uses, played in order: hit flash, cracked hull, broken hull, sinking.
    label(470, 292, 'hooks: hit, cracked (1.5s), broken (2.5s), sinks (4s)');
    const demo = createScallywagShip(
      this,
      { look: SHIP_LOOKS.brigantine, hullColour: 2, sailColour: 5, state: 'intact', cannons: 2 },
      520,
      345,
      { showCell: true },
    );
    // `&stage=2` (cracked) or `&stage=3` (broken) shows a step at once, for a still picture.
    const stage = Number(new URLSearchParams(window.location.search).get('stage') ?? 0);
    if (stage === 2) {
      setScallywagHull(demo, 'damaged');
    } else if (stage === 3) {
      (demo.getData('onDestroyed') as () => void)();
    } else {
      this.time.delayedCall(800, () => (demo.getData('flash') as () => void)());
      this.time.delayedCall(1500, () => setScallywagHull(demo, 'damaged'));
      this.time.delayedCall(2500, () => (demo.getData('onDestroyed') as () => void)());
      this.time.delayedCall(4000, () => void animateDestroyed(this, demo));
    }

    // The effects: smoke puffs and explosions, and the six wake frames.
    label(8, 330, 'effects: puff, explosion (x2), wake frames (x1)');
    for (let i = 0; i < FX_FRAMES; i += 1) {
      this.add.image(20 + i * 36, 352, ScallywagKeys.ships, fxFrameName('puff', i)).setScale(2);
      this.add.image(20 + i * 36, 388, ScallywagKeys.ships, fxFrameName('explosion', i)).setScale(2);
    }
    for (let i = 0; i < 6; i += 1) {
      this.add.image(190 + i * 36, 372, ScallywagKeys.ships, wakeFrameName(i));
    }

    // Terrain sheet at native size.
    label(8, 292, 'water and islands sheet (16 px tiles, native size)');
    this.add.image(8, 302, ScallywagKeys.water).setOrigin(0, 0);
  }
}
