import Phaser from 'phaser';
import type { GameEvent } from '@pirate/game-core/domain/GameEvent';
import { vectorFor } from '@pirate/game-core/domain/Direction';
import type { LashSide, Monster, MonsterMap } from '@pirate/game-core/domain/Monster';
import { getMonsterType } from '@pirate/game-core/config/monsterTypes';
import { TILE_SIZE, gridToWorld } from '../Grid';
import { WHIP_FRAME, WHIP_ROOT } from '../assets/giantSquid';
import { MONSTER_ART, attackAnimation, monsterFrame, type MonsterArt } from '../assets/monsterArt';
import { spawnImpact, spawnSplash } from '../animation/animateImpact';
import { spawnPixelImpact, spawnPixelSplash, usesPixelEffects } from '../animation/animateEffects';
import { headingToAngle } from './ShipView';

type Attacked = Extract<GameEvent, { type: 'MONSTER_ATTACKED' }>;
type Damaged = Extract<GameEvent, { type: 'MONSTER_DAMAGED' }>;
type Destroyed = Extract<GameEvent, { type: 'MONSTER_DESTROYED' }>;
type Moved = Extract<GameEvent, { type: 'MONSTER_MOVED' }>;

const DEPTH = 19;
const MARK_DEPTH = 11;
const BAR_DEPTH = 45;
const IDLE_MS = 260;
const ATTACK_FRAME_MS = 90;
const DEATH_FRAME_MS = 220;
const MOVE_MS = 260;
/** The colour of a marked cell: the warning that something will strike it. */
const MARK_COLOUR = 0xff4b3a;

interface MonsterView {
  readonly art: MonsterArt;
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Image;
  /** The foam round a monster that rises out of the water; it stays level while the body turns. */
  readonly ring: Phaser.GameObjects.Image | null;
  /** The limb a squid lashes with; absent for monsters that attack with their body. */
  readonly whip: Phaser.GameObjects.Image | null;
  readonly bar: Phaser.GameObjects.Graphics;
  readonly idle: Phaser.Time.TimerEvent;
  /** An attack, hurt, move or death animation owns the sprite; the idle sway waits. */
  busy: boolean;
  /** It is rising out of the water; syncing the board must not cut that short. */
  surfacing: boolean;
  frame: number;
  monster: Monster;
}

interface Mark {
  readonly cell: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly pulse: Phaser.Tweens.Tween;
  /** The phases (0 to 3) in which this cell is lashed. */
  phases: number[];
}

const markKey = (monsterId: string, cell: { x: number; y: number }): string => `${monsterId}:${cell.x},${cell.y}`;
const markText = (phases: readonly number[]): string => phases.map((phase) => phase + 1).join('·');

/** Where the whip is set, turned and mirrored, for each side it can lash. */
function placeWhip(whip: Phaser.GameObjects.Image, side: LashSide): void {
  whip.setOrigin(WHIP_ROOT.x / WHIP_FRAME.width, WHIP_ROOT.y / WHIP_FRAME.height);
  switch (side) {
    case 'left':
      whip.setPosition(WHIP_ROOT.x, WHIP_ROOT.y).setScale(1, 1).setRotation(0);
      break;
    case 'right':
      whip.setPosition(-WHIP_ROOT.x, WHIP_ROOT.y).setScale(-1, 1).setRotation(0);
      break;
    case 'front':
      whip.setPosition(0, WHIP_ROOT.y).setScale(1, 1).setRotation(Math.PI / 2);
      break;
  }
}

function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => scene.time.delayedCall(ms, resolve));
}

/**
 * The sea monsters on the board: the sprite (idle sway, attack, hurt, death), a
 * hull bar, and, when the match warns, the red marks on the cells it is expected
 * to lash, numbered by phase. It follows the authoritative monsters when the
 * board is synced and plays their events as the animator reaches them.
 */
export class MonsterField {
  private readonly views = new Map<string, MonsterView>();
  private readonly marks = new Map<string, Mark>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Makes the monsters, and the marks of what they will do, the ones in the state. */
  sync(monsters: MonsterMap | undefined): void {
    const wanted = monsters ?? {};
    for (const id of [...this.views.keys()]) {
      if (!wanted[id] || wanted[id].hp <= 0) {
        this.remove(id);
      }
    }
    for (const monster of Object.values(wanted)) {
      if (monster.hp <= 0) {
        continue;
      }
      const view = this.views.get(monster.id) ?? this.add(monster);
      view.monster = monster;
      this.place(view);
      this.drawBar(view);
    }
    this.syncMarks(Object.values(wanted).filter((monster) => monster.hp > 0));
  }

  /** A sailing monster moves: it glides to its new cell, turning to its new heading. */
  async moved(event: Moved): Promise<void> {
    const view = this.views.get(event.monsterId);
    if (!view) {
      return;
    }
    const monster: Monster = { ...view.monster, position: event.to, heading: event.heading };
    view.monster = monster;
    const target = this.centre(monster);
    const angle = view.art.upright ? 0 : Phaser.Math.Angle.Wrap(headingToAngle(event.heading));
    const from = Phaser.Math.Angle.Wrap(view.container.rotation);
    const turn = Phaser.Math.Angle.ShortestBetween(Phaser.Math.RadToDeg(from), Phaser.Math.RadToDeg(angle));
    view.bar.clear();
    await new Promise<void>((resolve) =>
      this.scene.tweens.add({
        targets: view.container,
        x: target.x,
        y: target.y,
        rotation: from + Phaser.Math.DegToRad(turn),
        duration: MOVE_MS,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve(),
      }),
    );
    view.container.setRotation(angle);
    this.drawBar(view);
  }

  /** The attack lands: the whip (or the bite) plays, then the mark is taken off the water. */
  async attack(event: Attacked): Promise<void> {
    const view = this.views.get(event.monsterId);
    const key = markKey(event.monsterId, event.cell);
    const mark = this.marks.get(key);
    if (view) {
      view.busy = true;
      if (view.art.upright && event.aim) {
        // The art reaches up, so "up" is turned round to the way it strikes.
        await this.turnTo(view, headingToAngle(event.aim) + Math.PI);
      }
      const animation = attackAnimation(view.art);
      for (let frame = 0; frame < view.art.attack.frames; frame += 1) {
        if (view.whip) {
          placeWhip(view.whip, event.side);
          view.whip.setVisible(true).setFrame(monsterFrame(animation, frame));
        } else {
          view.sprite.setFrame(monsterFrame(animation, frame));
        }
        if (frame === (view.art.attack.impact ?? Math.floor(view.art.attack.frames / 2))) {
          // The blow lands: the cell it strikes is shown, whether or not anyone was warned of it.
          mark?.cell.setFillStyle(MARK_COLOUR, 0.7);
          this.strike(event);
        }
        await wait(this.scene, view.art.attack.frameMs?.[frame] ?? ATTACK_FRAME_MS);
      }
      view.whip?.setVisible(false);
      if (view.art.upright && event.aim) {
        await this.turnTo(view, 0);
      }
      view.busy = false;
    }
    if (mark) {
      mark.phases = mark.phases.filter((phase) => phase !== event.phase);
      if (mark.phases.length === 0) {
        this.dropMark(key);
      } else {
        mark.cell.setFillStyle(MARK_COLOUR, 0.22);
        mark.label.setText(markText(mark.phases));
      }
    }
  }

  /** Swings the whole body round to an angle, the short way. */
  private turnTo(view: MonsterView, target: number): Promise<void> {
    const from = Phaser.Math.Angle.Wrap(view.container.rotation);
    const turn = Phaser.Math.Angle.ShortestBetween(Phaser.Math.RadToDeg(from), Phaser.Math.RadToDeg(Phaser.Math.Angle.Wrap(target)));
    return new Promise<void>((resolve) =>
      this.scene.tweens.add({
        targets: view.container,
        rotation: from + Phaser.Math.DegToRad(turn),
        duration: 110,
        ease: 'Sine.easeOut',
        onUpdate: () => view.ring?.setRotation(-view.container.rotation),
        onComplete: () => {
          view.ring?.setRotation(-view.container.rotation);
          resolve();
        },
      }),
    );
  }

  /**
   * What the blow does to the cell it lands on: the tile flashes and claw marks
   * flick across it. A ship there is struck (sparks and a jolt of the camera);
   * an empty cell only throws up spray.
   */
  private strike(event: Attacked): void {
    const { x, y } = gridToWorld(event.cell);
    const hit = event.targetId !== undefined;
    const colour = hit ? 0xff4b3a : 0xbfe6ff;

    const flash = this.scene.add
      .rectangle(x, y, TILE_SIZE - 4, TILE_SIZE - 4, colour, hit ? 0.7 : 0.4)
      .setDepth(MARK_DEPTH + 0.5);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: hit ? 380 : 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Three claw marks, drawn one after another, then fading away.
    const marks = this.scene.add.graphics().setDepth(72);
    marks.lineStyle(hit ? 5 : 3, hit ? 0xffeae6 : 0xffffff, 1);
    for (let i = 0; i < 3; i += 1) {
      const offset = -16 + i * 16;
      marks.beginPath();
      marks.moveTo(x - 20 + offset, y - 24);
      marks.lineTo(x + 6 + offset, y + 24);
      marks.strokePath();
    }
    marks.setAlpha(0);
    this.scene.tweens.add({
      targets: marks,
      alpha: 1,
      duration: 60,
      yoyo: true,
      hold: 140,
      onComplete: () => marks.destroy(),
    });

    if (hit) {
      if (usesPixelEffects()) {
        spawnPixelImpact(this.scene, event.cell);
      } else {
        spawnImpact(this.scene, event.cell);
      }
      this.scene.cameras.main.shake(140, 0.004);
    } else if (usesPixelEffects()) {
      spawnPixelSplash(this.scene, event.cell);
    } else {
      spawnSplash(this.scene, event.cell);
    }
  }

  /** Hit by cannon fire: a white flash, then a flinch, then it settles. */
  async hurt(event: Damaged): Promise<void> {
    const view = this.views.get(event.monsterId);
    if (!view) {
      return;
    }
    view.monster = { ...view.monster, hp: event.hp };
    this.drawBar(view);
    view.busy = true;
    for (let frame = 0; frame < view.art.hurt; frame += 1) {
      view.sprite.setFrame(monsterFrame('hurt', frame));
      await wait(this.scene, 110);
    }
    view.busy = false;
  }

  /** Sunk: it goes limp and pale and sinks. */
  async destroyed(event: Destroyed): Promise<void> {
    const view = this.views.get(event.monsterId);
    if (!view) {
      return;
    }
    view.busy = true;
    view.whip?.setVisible(false);
    view.bar.clear();
    this.dropMarksOf(event.monsterId);
    for (let frame = 0; frame < view.art.death; frame += 1) {
      view.sprite.setFrame(monsterFrame('death', frame));
      view.ring?.setFrame(monsterFrame('ring', Math.min(frame + 1, 3)));
      await wait(this.scene, DEATH_FRAME_MS);
    }
    await new Promise<void>((resolve) =>
      this.scene.tweens.add({ targets: view.container, alpha: 0, duration: 320, onComplete: () => resolve() }),
    );
    this.remove(event.monsterId);
  }

  destroy(): void {
    for (const id of [...this.views.keys()]) {
      this.remove(id);
    }
    for (const key of [...this.marks.keys()]) {
      this.dropMark(key);
    }
  }

  private add(monster: Monster): MonsterView {
    const art = MONSTER_ART[monster.monsterTypeId];
    const ring = art.ring ? this.scene.add.image(0, 0, art.key, monsterFrame('ring', 0)) : null;
    const sprite = this.scene.add.image(0, 0, art.key, monsterFrame('idle', 0));
    const whip =
      art.attack.kind === 'overlay'
        ? this.scene.add.image(0, 0, art.key, monsterFrame('whip', 0)).setVisible(false)
        : null;
    const container = this.scene.add
      .container(0, 0, [...(ring ? [ring] : []), sprite, ...(whip ? [whip] : [])])
      .setDepth(DEPTH);
    const bar = this.scene.add.graphics().setDepth(BAR_DEPTH);
    // One that has just risen out of the water (a tentacle) comes up through a ring of spray.
    const rising = monster.surfacedOnTurn !== undefined && monster.surfacedOnTurn > 1;
    const view: MonsterView = {
      art,
      container,
      sprite,
      ring,
      whip,
      bar,
      busy: false,
      surfacing: rising,
      frame: 0,
      monster,
      idle: this.scene.time.addEvent({
        delay: IDLE_MS,
        loop: true,
        callback: () => {
          if (view.busy) {
            return;
          }
          view.frame = (view.frame + 1) % art.idle;
          view.sprite.setFrame(monsterFrame('idle', view.frame));
        },
      }),
    };
    this.views.set(monster.id, view);
    if (rising) {
      this.surface(view);
    }
    return view;
  }

  /** It rises: the body grows up out of a ring of foam that spreads and fades. */
  private surface(view: MonsterView): void {
    const { x, y } = this.centre(view.monster);
    view.container.setAlpha(0).setScale(0.55);
    this.scene.tweens.add({
      targets: view.container,
      alpha: 1,
      scale: 1,
      duration: 520,
      ease: 'Back.easeOut',
      onComplete: () => {
        view.surfacing = false;
      },
    });
    const ring = this.scene.add.circle(x, y, 10).setStrokeStyle(3, 0xe8f6ff, 0.9).setDepth(DEPTH + 0.5);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** The body's centre is halfway along its cells. */
  private centre(monster: Monster): { x: number; y: number } {
    const length = getMonsterType(monster.monsterTypeId).length;
    const stern = gridToWorld(monster.position);
    const step = vectorFor(monster.heading);
    const reach = ((length - 1) * TILE_SIZE) / 2;
    return { x: stern.x + step.x * reach, y: stern.y + step.y * reach };
  }

  /** The body sits halfway along its cells and turns with its heading. */
  private place(view: MonsterView): void {
    const { monster } = view;
    const { x, y } = this.centre(monster);
    view.container.setPosition(x, y);
    if (!view.busy) {
      view.container.setRotation(view.art.upright ? 0 : headingToAngle(monster.heading));
      view.ring?.setRotation(0);
    }
    if (!view.surfacing) {
      view.container.setAlpha(1);
    }
    if (!view.busy) {
      view.sprite.setFrame(monsterFrame('idle', view.frame));
    }
  }

  private drawBar(view: MonsterView): void {
    const { monster, bar } = view;
    bar.clear();
    const { x: cx, y: cy } = this.centre(monster);
    const length = getMonsterType(monster.monsterTypeId).length;
    // How far its body reaches above its centre: the whole length when upright, one cell on its side.
    const upright = monster.heading === 'NORTH' || monster.heading === 'SOUTH';
    const half = ((upright ? length : 1) * TILE_SIZE) / 2;
    const width = 48;
    const x = cx - width / 2;
    const y = cy - half - 10;
    const share = Math.max(0, monster.hp / monster.maxHp);
    bar.fillStyle(0x06202e, 0.75).fillRect(x - 2, y - 2, width + 4, 9);
    bar.fillStyle(share > 0.5 ? 0x6fcf6f : share > 0.25 ? 0xffd24a : 0xff5a4a, 1).fillRect(x, y, width * share, 5);
  }

  private syncMarks(monsters: readonly Monster[]): void {
    const wanted = new Map<string, { cell: { x: number; y: number }; phases: number[] }>();
    for (const monster of monsters) {
      for (const attack of monster.attacks) {
        const key = markKey(monster.id, attack.cell);
        const entry = wanted.get(key) ?? { cell: attack.cell, phases: [] as number[] };
        entry.phases.push(attack.phase);
        wanted.set(key, entry);
      }
    }
    for (const key of [...this.marks.keys()]) {
      if (!wanted.has(key)) {
        this.dropMark(key);
      }
    }
    for (const [key, { cell: at, phases }] of wanted) {
      phases.sort((a, b) => a - b);
      const existing = this.marks.get(key);
      if (existing) {
        existing.phases = phases;
        existing.label.setText(markText(phases));
        continue;
      }
      const { x, y } = gridToWorld(at);
      const cell = this.scene.add
        .rectangle(x, y, TILE_SIZE - 6, TILE_SIZE - 6, MARK_COLOUR, 0.22)
        .setStrokeStyle(2, MARK_COLOUR, 0.9)
        .setDepth(MARK_DEPTH);
      const label = this.scene.add
        .text(x, y, markText(phases), {
          fontFamily: 'monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#ffd9d3',
          stroke: '#4a0f0a',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(MARK_DEPTH + 0.1);
      const pulse = this.scene.tweens.add({
        targets: cell,
        alpha: 0.55,
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
      this.marks.set(key, { cell, label, pulse, phases });
    }
  }

  private dropMark(key: string): void {
    const mark = this.marks.get(key);
    if (!mark) {
      return;
    }
    mark.pulse.stop();
    mark.cell.destroy();
    mark.label.destroy();
    this.marks.delete(key);
  }

  private dropMarksOf(monsterId: string): void {
    for (const key of [...this.marks.keys()]) {
      if (key.startsWith(`${monsterId}:`)) {
        this.dropMark(key);
      }
    }
  }

  private remove(id: string): void {
    const view = this.views.get(id);
    if (!view) {
      return;
    }
    view.idle.remove();
    view.bar.destroy();
    view.container.destroy();
    this.views.delete(id);
    this.dropMarksOf(id);
  }
}
