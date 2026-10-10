import Phaser from 'phaser';
import { ScallywagKeys } from './scallywag';

/** Pixel art is drawn with nearest-neighbour filtering so it stays crisp. */
export function useCrispFiltering(textures: Phaser.Textures.TextureManager): void {
  for (const key of Object.values(ScallywagKeys)) {
    textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
