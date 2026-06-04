import { startDefaultServer, startProductionServer } from './SignalingServer.js';
import { resolve } from 'node:path';

// Check if we're in production mode (static files available)
const isProduction = process.env.NODE_ENV === 'production';
// In Docker, the client dist is at /app/client-dist
// In local development with npm run start, it's at ../client/dist relative to server/dist
const staticDir = process.env.STATIC_DIR || 
  (process.env.NODE_ENV === 'production' ? '/app/client-dist' : resolve(new URL('.', import.meta.url).pathname, '../../../client/dist'));

const server = isProduction
  ? await startProductionServer(undefined, undefined, staticDir)
  : await startDefaultServer();

const shutdown = (_signal: string): void => {
  void server.close().then(() => process.exit(0));
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
