import {
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';
import { DEFAULT_PORT, Logger } from '@lfs/shared';
import type { AnySignalingMessage } from '@lfs/shared';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  AcceptConnectHandler,
  ConnectRequestHandler,
  DisconnectHandler,
  RejectConnectHandler,
} from './ConnectHandlers.js';
import { AnswerHandler, IceCandidateHandler, OfferHandler } from './WebRTCHandlers.js';
import { DeviceRegistry } from './DeviceRegistry.js';
import { parseSignalingMessage } from './MessageParser.js';
import { RegisterHandler, broadcastDeviceList } from './RegisterHandler.js';
import { SignalingRouter } from './SignalingRouter.js';

export interface SignalingServerOptions {
  port?: number;
  host?: string;
  serveStatic?: (req: IncomingMessage, res: ServerResponse) => boolean;
  logger?: Logger;
}

export class SignalingServer {
  private readonly httpServer: HttpServer;
  private readonly wsServer: WebSocketServer;
  private readonly registry: DeviceRegistry;
  private readonly router: SignalingRouter;
  private readonly logger: Logger;
  private readonly serveStatic: (req: IncomingMessage, res: ServerResponse) => boolean;
  private readonly sockets = new Set<WebSocket>();
  private port = 0;

  constructor(options: SignalingServerOptions = {}) {
    this.logger = options.logger ?? new Logger('SignalingServer');
    this.registry = new DeviceRegistry();
    this.serveStatic = options.serveStatic ?? (() => false);

    this.httpServer = createServer((req, res) => {
      this.logger.info('http request', { method: req.method, url: req.url });
      if (this.serveStatic(req, res)) {
        return;
      }
      this.handleHttp(req, res);
    });

    this.wsServer = new WebSocketServer({ noServer: true });

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.wsServer.handleUpgrade(req, socket, head, (ws) => {
        this.wsServer.emit('connection', ws, req);
      });
    });

    this.wsServer.on('connection', (ws) => this.onConnection(ws));

    this.router = new SignalingRouter({
      registry: this.registry,
      broadcast: (payload, except) => this.broadcast(payload, except as WebSocket | undefined),
      logger: this.logger.child('Router'),
    });
    this.router.register(new RegisterHandler(this.logger.child('RegisterHandler')));
    this.router.register(new ConnectRequestHandler(this.logger.child('ConnectRequestHandler')));
    this.router.register(new AcceptConnectHandler(this.logger.child('AcceptConnectHandler')));
    this.router.register(new RejectConnectHandler(this.logger.child('RejectConnectHandler')));
    this.router.register(new DisconnectHandler(this.logger.child('DisconnectHandler')));
    this.router.register(new OfferHandler(this.logger.child('OfferHandler')));
    this.router.register(new AnswerHandler(this.logger.child('AnswerHandler')));
    this.router.register(new IceCandidateHandler(this.logger.child('IceCandidateHandler')));

    this.registry.onChange((devices) => {
      broadcastDeviceList({ broadcast: (m) => this.broadcast(m) }, devices, this.logger.child('DeviceList'));
    });
  }

  getDeviceList() {
    return this.registry.toDescriptors();
  }

  getRegistry(): DeviceRegistry {
    return this.registry;
  }

  getRouter(): SignalingRouter {
    return this.router;
  }

  getAddress(): { port: number; host: string } | null {
    const addr = this.httpServer.address();
    if (addr === null || typeof addr === 'string') {
      return null;
    }
    return { port: addr.port, host: addr.address };
  }

  listen(port = DEFAULT_PORT, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(port, host, () => {
        this.port = this.getAddress()?.port ?? port;
        this.logger.info('listening', { port: this.port, host });
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const ws of this.sockets) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      this.sockets.clear();
      this.httpServer.close(() => resolve());
    });
  }

  private handleHttp(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(COMING_SOON_HTML);
  }

  private onConnection(ws: WebSocket): void {
    this.sockets.add(ws);
    this.logger.info('socket connected', { count: this.sockets.size });

    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      let message: AnySignalingMessage;
      try {
        message = parseSignalingMessage(text);
      } catch (err) {
        this.logger.warn('parse error', { error: (err as Error).message });
        return;
      }
      void this.router.route(ws, message);
    });

    ws.on('close', () => {
      this.sockets.delete(ws);
      this.handleSocketClose(ws);
    });

    ws.on('error', (err) => {
      this.logger.warn('socket error', { error: err.message });
    });
  }

  private handleSocketClose(ws: WebSocket): void {
    for (const device of this.registry.getAll()) {
      if (device.socket === ws) {
        this.registry.unregister(device.deviceId);
      }
    }
  }

  private broadcast(payload: AnySignalingMessage, except?: WebSocket): void {
    const json = JSON.stringify(payload);
    for (const ws of this.sockets) {
      if (ws === except) continue;
      if (ws.readyState !== ws.OPEN) continue;
      try {
        ws.send(json);
      } catch (err) {
        this.logger.warn('broadcast send failed', { error: (err as Error).message });
      }
    }
  }
}

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

export async function startDefaultServer(port = DEFAULT_PORT): Promise<SignalingServer> {
  const server = new SignalingServer();
  await server.listen(port);
  return server;
}
