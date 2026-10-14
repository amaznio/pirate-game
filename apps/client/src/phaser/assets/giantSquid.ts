import type Phaser from 'phaser';
import manifest from './giantSquidFrames.json';

/** The texture key of the giant squid sheet (`public/assets/monsters/giant-squid.png`). */
export const GIANT_SQUID_KEY = 'giant-squid';
export const GIANT_SQUID_PATH = 'assets/monsters/giant-squid.png';

export const SQUID_IDLE_FRAMES = 4;
export const SQUID_WHIP_FRAMES = 6;
export const SQUID_HURT_FRAMES = 2;
export const SQUID_DEATH_FRAMES = 5;

export const squidFrame = {
  idle: (index: number): string => `idle/${index}`,
  whip: (index: number): string => `whip/${index}`,
  hurt: (index: number): string => `hurt/${index}`,
  death: (index: number): string => `death/${index}`,
};

/**
 * Where a whip starts, in its own 96 x 64 frame. The frame is laid over the
 * right-hand side of the squid's bow cell, so this point sits on the base of its
 * arms; the whip is drawn pivoting on it, and turned or mirrored from there.
 */
export const WHIP_ROOT = { x: 14, y: 18 } as const;
export const WHIP_FRAME = { width: 96, height: 64 } as const;

/**
 * Cuts the sheet into its frames (the rectangles come from the manifest the
 * sprite generator, `tools/art/giant_squid.py`, writes beside the picture).
 */
export function registerGiantSquidFrames(textures: Phaser.Textures.TextureManager): void {
  const texture = textures.get(GIANT_SQUID_KEY);
  for (const [name, rect] of Object.entries(manifest.frames)) {
    if (!texture.has(name)) {
      texture.add(name, 0, rect.x, rect.y, rect.w, rect.h);
    }
  }
}
