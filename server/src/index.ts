import { loadConfig } from './config.js';
import { createGameServer } from './gameServer.js';

const config = loadConfig();
const server = createGameServer(config);
const port = await server.listen();
console.log(`blindspot server listening on :${port} (origins: ${config.clientOrigins.join(', ')})`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
