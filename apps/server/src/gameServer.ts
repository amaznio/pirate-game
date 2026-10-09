import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pirate/game-core/protocol/messages';
import type { ServerConfig } from './config';
import { handleConnection } from './connection';
import { RoomManager } from './rooms/RoomManager';
import type { GameSocket } from './rooms/Room';

export interface GameServer {
  /** The port actually listening (useful when asked for port 0). */
  readonly port: number;
  readonly rooms: RoomManager;
  close(): Promise<void>;
}

/** Everything the server answers over plain HTTP: a health check for Railway. */
function handleHttp(
  rooms: RoomManager,
  startedAt: number,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    if (request.method === 'GET' && path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'ok',
          rooms: rooms.size,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      );
      return;
    }
    if (request.method === 'GET' && path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Battle Navigation game server\n');
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found\n');
  };
}

/** Starts the HTTP + Socket.IO server. */
export async function createGameServer(config: ServerConfig): Promise<GameServer> {
  const startedAt = Date.now();
  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    idleRoomMs: config.idleRoomMs,
    awayGraceMs: config.awayGraceMs,
  });

  const httpServer = createServer(handleHttp(rooms, startedAt));
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: config.clientOrigins.includes('*') ? true : [...config.clientOrigins],
    },
    // Plans are tiny; anything big is not a plan.
    maxHttpBufferSize: 64 * 1024,
  });

  io.on('connection', (socket) => handleConnection(socket as GameSocket, rooms));
  rooms.startSweeping();

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  return {
    port: (httpServer.address() as AddressInfo).port,
    rooms,
    close: async () => {
      rooms.closeAll('The server is shutting down.');
      await io.close();
    },
  };
}
