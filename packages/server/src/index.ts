import { startDefaultServer } from './SignalingServer.js';

const server = await startDefaultServer();
const address = server.getAddress();
if (address) {
  console.log(`Server running at http://localhost:${address.port}`);
}

const shutdown = (signal: string): void => {
  console.log(`[server] received ${signal}, shutting down`);
  void server.close().then(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
