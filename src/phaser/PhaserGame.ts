import Phaser from 'phaser';
import type { GameController } from '../game/controller/GameController';
import type { EventBus } from '../game/events/EventBus';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

export interface PhaserContext {
  controller: GameController;
  eventBus: EventBus;
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
  destroy(): void;
}

/**
 * Boots the Phaser game inside a DOM container. The scene receives the same
 * controller/event bus the React UI uses, so there is a single source of truth.
 */
export function createPhaserGame(
  parent: HTMLElement,
  controller: GameController,
  eventBus: EventBus,
): PhaserHandle {
  context = { controller, eventBus };

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
    destroy: () => {
      game.destroy(true);
      context = null;
    },
  };
}
