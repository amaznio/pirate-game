import Phaser from 'phaser';
import type { GameClient } from '@pirate/game-core/client/GameClient';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { pixelRatio } from './pixelRatio';

export interface PhaserContext {
  client: GameClient;
  /** Latest UI insets in canvas (device) pixels, kept here so a scene that boots late still gets them. */
  insets: { top: number; bottom: number };
}


let context: PhaserContext | null = null;

export function getPhaserContext(): PhaserContext {
  if (!context) {
    throw new Error('Phaser context has not been initialised');
  }
  return context;
}

export interface PhaserHandle {
  recenterOnPlayer(): void;
  /** Pixels at the top and bottom of the canvas covered by UI. */
  /** CSS pixels at the top and bottom of the canvas covered by UI. */
  setInsets(insets: { top: number; bottom: number }): void;
  destroy(): void;
}

/**
 * Boots the Phaser game inside a DOM container. The scene receives the same
 * client the React UI uses, so both see the same view of the match.
 */
export function createPhaserGame(
  parent: HTMLElement,
  client: GameClient,
): PhaserHandle {
  context = { client, insets: { top: 0, bottom: 0 } };

  const ratio = pixelRatio();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b1f2a',
    scale: {
      // The canvas has one pixel per device pixel and is shown at CSS size (a
      // zoom of 1 / ratio). It follows its parent by hand, below.
      mode: Phaser.Scale.NONE,
      width: Math.round((parent.clientWidth || 800) * ratio),
      height: Math.round((parent.clientHeight || 600) * ratio),
      zoom: 1 / ratio,
    },
    render: { antialias: true },
    scene: [BootScene, BattleScene],
  });

  const fitToParent = () => {
    const current = pixelRatio();
    game.scale.setZoom(1 / current);
    game.scale.resize(
      Math.max(1, Math.round(parent.clientWidth * current)),
      Math.max(1, Math.round(parent.clientHeight * current)),
    );
  };
  const observer = new ResizeObserver(fitToParent);
  observer.observe(parent);

  return {
    recenterOnPlayer: () => {
      const scene = game.scene.getScene('BattleScene') as BattleScene | null;
      scene?.recenterOnPlayer();
    },
    setInsets: (cssInsets) => {
      // The UI measures in CSS pixels; the canvas is in device pixels.
      const insets = { top: cssInsets.top * pixelRatio(), bottom: cssInsets.bottom * pixelRatio() };
      if (context) {
        context.insets = insets;
      }
      const scene = game.scene.getScene('BattleScene') as BattleScene | null;
      scene?.setInsets(insets);
    },
    destroy: () => {
      observer.disconnect();
      game.destroy(true);
      context = null;
    },
  };
}
