import { startDefaultServer } from './SignalingServer.js';

const server = await startDefaultServer();
const address = server.getAddress();
if (address) {
}

const shutdown = (_signal: string): void => {
  void server.close().then(() => process.exit(0));
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
