import { EventBus } from '../game/events/EventBus';
import { GameController } from '../game/controller/GameController';
import { GameClient } from '../game/client/GameClient';
import { LocalTransport } from '../game/client/LocalTransport';
import { matchConfigFromSearch } from './matchFromUrl';

/**
 * The match is hosted in this page, and the UI plays it through a client that
 * talks to the host over a transport exactly as it would over a network: it
 * only ever sees a redacted view, and sends whole plans. To play online, swap
 * LocalTransport for a socket transport and delete the host from this file.
 */
export const eventBus = new EventBus();
export const gameHost = new GameController(eventBus, {
  config: matchConfigFromSearch(window.location.search),
});

const viewerId = gameHost.getFirstHumanId();
if (!viewerId) {
  throw new Error('A match needs at least one human player to control');
}

export const gameClient = new GameClient(
  new LocalTransport(gameHost, eventBus, viewerId),
);
