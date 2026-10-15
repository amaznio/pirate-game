import Phaser from 'phaser';
import { ArtLabScene } from './ArtLabScene';

/** Boots the art lab (`?lab=art`) in place of the app. Never part of a match. */
export function mountArtLab(parent: HTMLElement): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1e7fd6',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 800,
    },
    render: { antialias: false, pixelArt: true },
    scene: [ArtLabScene],
  });
}
