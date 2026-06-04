import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { DEFAULT_PORT, Logger } from '@lfs/shared';

const logger = new Logger('server');
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

const COMING_SOON_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Local File Share</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0b1220;
        color: #e6e8ee;
      }
      main {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        font-size: 1.75rem;
        margin: 0 0 0.5rem;
      }
      p {
        margin: 0;
        opacity: 0.7;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Local File Share &mdash; coming soon</h1>
      <p>Signaling server is online.</p>
    </main>
  </body>
</html>
`;

function sendComingSoon(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(COMING_SOON_HTML);
}

const server = createServer((req, res) => {
  logger.info('http request', { method: req.method, url: req.url });
  sendComingSoon(req, res);
});

server.listen(PORT, () => {
  logger.info('listening', { port: PORT });
});

const shutdown = (signal: string): void => {
  logger.info('shutdown', { signal });
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
