import type Phaser from 'phaser';
import type { MonsterTypeId } from '@pirate/game-core/domain/Monster';
import squidManifest from './giantSquidFrames.json';
import sharkManifest from './sharkFrames.json';
import squidSmallManifest from './squidFrames.json';
import tentacleManifest from './tentacleFrames.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** How a monster's attack is drawn: a limb laid over the board, or a change of the body itself. */
export type MonsterAttackArt =
  | { readonly kind: 'overlay'; readonly frames: number; readonly impact?: number; readonly frameMs?: readonly number[] }
  | { readonly kind: 'body'; readonly frames: number; readonly impact?: number; readonly frameMs?: readonly number[] };

/** One monster's picture: its sheet, and how many frames each animation has. */
export interface MonsterArt {
  readonly key: string;
  readonly path: string;
  readonly frames: Readonly<Record<string, FrameRect>>;
  readonly idle: number;
  readonly hurt: number;
  readonly death: number;
  readonly attack: MonsterAttackArt;
  /** Drawn the same way up whatever it faces; it turns only to strike. */
  readonly upright?: boolean;
  /** Has a ring of foam in its own frames (`ring/0` to `ring/3`), kept level while the body turns. */
  readonly ring?: boolean;
}

/** The sheets, made by the scripts in `tools/art/` (each writes its picture and its frame manifest). */
export const MONSTER_ART: Readonly<Record<MonsterTypeId, MonsterArt>> = {
  'giant-squid': {
    key: 'giant-squid',
    path: 'assets/monsters/giant-squid.png',
    frames: squidManifest.frames,
    idle: 4,
    hurt: 2,
    death: 5,
    attack: { kind: 'overlay', frames: 6 },
  },
  squid: {
    key: 'squid',
    path: 'assets/monsters/squid.png',
    frames: squidSmallManifest.frames,
    idle: 4,
    hurt: 2,
    death: 3,
    attack: { kind: 'body', frames: 3 },
  },
  tentacle: {
    key: 'tentacle',
    path: 'assets/monsters/tentacle.png',
    frames: tentacleManifest.frames,
    idle: 4,
    hurt: 2,
    death: 3,
    // Coil back, snap out, full reach (the blow lands here), slam, recoil: quick in the middle.
    attack: { kind: 'body', frames: 5, impact: 2, frameMs: [140, 45, 70, 110, 130] },
    upright: true,
    ring: true,
  },
  shark: {
    key: 'shark',
    path: 'assets/monsters/shark.png',
    frames: sharkManifest.frames,
    idle: 4,
    hurt: 2,
    death: 3,
    attack: { kind: 'body', frames: 3 },
  },
};

export const MONSTER_ART_LIST: readonly MonsterArt[] = Object.values(MONSTER_ART);

/** The frame names of an animation: `idle/0`, `hurt/1`, `whip/3`, `bite/2`, `death/4`. */
export const monsterFrame = (animation: string, index: number): string => `${animation}/${index}`;

/** The name an attack's frames go by. */
export function attackAnimation(art: MonsterArt): string {
  return art.attack.kind === 'overlay' ? 'whip' : 'bite';
}

/** Cuts each sheet into its frames. */
export function registerMonsterFrames(textures: Phaser.Textures.TextureManager): void {
  for (const art of MONSTER_ART_LIST) {
    const texture = textures.get(art.key);
    for (const [name, rect] of Object.entries(art.frames)) {
      if (!texture.has(name)) {
        texture.add(name, 0, rect.x, rect.y, rect.w, rect.h);
      }
    }
  }
}
