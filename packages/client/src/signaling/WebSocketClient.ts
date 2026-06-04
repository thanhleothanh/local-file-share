import type { AnySignalingMessage, DeviceDescriptor, SignalingMessageType } from '@lfs/shared';
import { MessageParseError, parseClientMessage } from './MessageParser.js';

export type WebSocketFactory = (url: string) => WebSocket;

export type WebSocketEvent =
  | 'open'
  | 'close'
  | 'error'
  | 'message'
  | 'device-list-updated'
  | 'incoming-connect-request'
  | 'connect-accepted'
  | 'connect-rejected'
  | 'peer-disconnected'
  | 'registered'
  | 'parse-error'
  | 'socket-error';

export interface WebSocketLogger {
  info: (msg: string, ctx?: unknown) => void;
  warn: (msg: string, ctx?: unknown) => void;
  error: (msg: string, ctx?: unknown) => void;
}

export interface WebSocketClientOptions {
  url: string;
  factory?: WebSocketFactory;
  identityProvider: () => { deviceId: string; deviceName: string };
  logger?: WebSocketLogger;
  on?: (event: WebSocketEvent, handler: (payload: unknown) => void) => () => void;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private readonly factory: WebSocketFactory;
  private readonly identityProvider: WebSocketClientOptions['identityProvider'];
  private readonly logger: WebSocketLogger;
  private readonly listeners = new Map<WebSocketEvent, Set<(payload: unknown) => void>>();
  private readonly subscribeFn: (event: WebSocketEvent, handler: (payload: unknown) => void) => () => void;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.factory = options.factory ?? ((url) => new WebSocket(url));
    this.identityProvider = options.identityProvider;
    this.logger = options.logger ?? {
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    this.subscribeFn = options.on ?? (() => () => undefined);
  }

  connect(): void {
    if (this.socket !== null) {
      return;
    }
    const ws = this.factory(this.url);
    this.socket = ws;
    ws.addEventListener('open', () => this.handleOpen());
    ws.addEventListener('close', () => this.handleClose());
    ws.addEventListener('error', (ev) => this.emit('socket-error', ev));
    ws.addEventListener('message', (ev) => this.handleMessage(ev));
  }

  disconnect(): void {
    if (this.socket === null) return;
    try {
      this.socket.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  send(message: AnySignalingMessage): boolean {
    if (this.socket === null || this.socket.readyState !== this.socket.OPEN) {
      return false;
    }
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      this.logger.warn('[WebSocketClient] send failed', { error: (err as Error).message });
      return false;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === this.socket.OPEN;
  }

  on(event: WebSocketEvent, handler: (payload: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private handleOpen(): void {
    const { deviceId, deviceName } = this.identityProvider();
    const message: AnySignalingMessage = {
      type: 'register',
      from: deviceId,
      data: { name: deviceName },
      timestamp: Date.now(),
    };
    const sent = this.send(message);
    if (sent) {
      this.emit('registered', { deviceId, deviceName });
    }
  }

  private handleClose(): void {
    this.emit('close', undefined);
    this.socket = null;
  }

  private handleMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (typeof data !== 'string') {
      return;
    }
    let message: AnySignalingMessage;
    try {
      message = parseClientMessage(data);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      this.logger.warn('[WebSocketClient] parse error', { error: errObj.message });
      this.emit('parse-error', { error: errObj.message, raw: data });
      return;
    }
    this.dispatchParsedMessage(message);
  }

  private dispatchParsedMessage(message: AnySignalingMessage): void {
    this.emit('message', message);
    switch (message.type) {
      case 'device-list': {
        const devices = (message.data as { devices: DeviceDescriptor[] } | undefined)?.devices ?? [];
        this.logger.info('[WebSocketClient] device-list', devices);
        this.emit('device-list-updated', devices);
        break;
      }
      case 'connect-request':
        this.emit('incoming-connect-request', message);
        break;
      case 'connect-accepted':
        this.emit('connect-accepted', message);
        break;
      case 'connect-rejected':
        this.emit('connect-rejected', message);
        break;
      case 'disconnect':
        this.emit('peer-disconnected', message);
        break;
      default:
        break;
    }
  }

  private emit(event: WebSocketEvent, payload: unknown): void {
    this.subscribeFn(event, () => {
      /* external wiring; payload is delivered via internal listeners */
    });
    const set = this.listeners.get(event);
    if (set === undefined) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        this.logger.error('[WebSocketClient] listener threw', { error: errObj.message });
      }
    }
  }
}

export { MessageParseError };
export type { AnySignalingMessage, DeviceDescriptor, SignalingMessageType };
