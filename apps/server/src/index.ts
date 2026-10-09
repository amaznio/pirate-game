import { loadConfig } from './config';
import { createGameServer } from './gameServer';

const config = loadConfig();
const server = await createGameServer(config);

console.log(`Game server listening on ${config.host}:${server.port}`);
console.log(`Allowed client origins: ${config.clientOrigins.join(', ')}`);

// Railway stops a service with SIGTERM: close sockets and timers, then exit.
let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log(`${signal} received, shutting down`);
  await server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
