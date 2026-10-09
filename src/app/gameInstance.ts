import { EventBus } from '../game/events/EventBus';
import { GameController } from '../game/controller/GameController';
import { matchConfigFromSearch } from './matchFromUrl';

/**
 * Single application-wide instances. React and Phaser both talk to the same
 * controller/event bus so there is never a second authoritative game state.
 */
export const eventBus = new EventBus();
export const gameController = new GameController(eventBus, {
  config: matchConfigFromSearch(window.location.search),
});
