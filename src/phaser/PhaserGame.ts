import Phaser from 'phaser';
import type { GameClient } from '../game/client/GameClient';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

export interface PhaserContext {
  client: GameClient;
  /** Latest UI insets, kept here so a scene that boots late still gets them. */
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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b1f2a',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || 800,
      height: parent.clientHeight || 600,
    },
    render: { antialias: true },
    scene: [BootScene, BattleScene],
  });

  return {
    recenterOnPlayer: () => {
      const scene = game.scene.getScene('BattleScene') as BattleScene | null;
      scene?.recenterOnPlayer();
    },
    setInsets: (insets) => {
      if (context) {
        context.insets = insets;
      }
      const scene = game.scene.getScene('BattleScene') as BattleScene | null;
      scene?.setInsets(insets);
    },
    destroy: () => {
      game.destroy(true);
      context = null;
    },
  };
}
