import type Phaser from 'phaser';
import type { MonsterTypeId } from '@pirate/game-core/domain/Monster';
import squidManifest from './giantSquidFrames.json';
import sharkManifest from './sharkFrames.json';
import squidSmallManifest from './squidFrames.json';

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** How a monster's attack is drawn: a limb laid over the board, or a change of the body itself. */
export type MonsterAttackArt =
  | { readonly kind: 'overlay'; readonly frames: number }
  | { readonly kind: 'body'; readonly frames: number };

/** One monster's picture: its sheet, and how many frames each animation has. */
export interface MonsterArt {
  readonly key: string;
  readonly path: string;
  readonly frames: Readonly<Record<string, FrameRect>>;
  readonly idle: number;
  readonly hurt: number;
  readonly death: number;
  readonly attack: MonsterAttackArt;
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
