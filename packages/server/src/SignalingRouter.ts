import type { AnySignalingMessage, SignalingMessageType } from '@lfs/shared';
import { Logger } from '@lfs/shared';
import type { WebSocket } from 'ws';
import type { DeviceRegistry } from './DeviceRegistry.js';

export interface MessageHandlerContext {
  client: WebSocket;
  message: AnySignalingMessage;
  registry: DeviceRegistry;
  broadcast: (payload: AnySignalingMessage, except?: WebSocket) => void;
}

export interface MessageHandler {
  readonly type: SignalingMessageType;
  handle(ctx: MessageHandlerContext): void | Promise<void>;
}

export class SignalingRouter {
  private readonly handlers = new Map<SignalingMessageType, MessageHandler>();
  private readonly logger: Logger;
  private readonly registry: DeviceRegistry;
  private readonly broadcast: (payload: AnySignalingMessage, except?: WebSocket) => void;

  constructor(opts: {
    registry: DeviceRegistry;
    broadcast: (payload: AnySignalingMessage, except?: WebSocket) => void;
    logger?: Logger;
  }) {
    this.registry = opts.registry;
    this.broadcast = opts.broadcast;
    this.logger = opts.logger ?? new Logger('SignalingRouter');
  }

  register(handler: MessageHandler): void {
    this.handlers.set(handler.type, handler);
  }

  has(type: SignalingMessageType): boolean {
    return this.handlers.has(type);
  }

  async route(client: WebSocket, message: AnySignalingMessage): Promise<void> {
    const handler = this.handlers.get(message.type);
    if (handler === undefined) {
      this.logger.warn('unknown handler', { type: message.type });
      return;
    }
    try {
      await handler.handle({ client, message, registry: this.registry, broadcast: this.broadcast });
    } catch (err) {
      this.logger.error('handler threw', { type: message.type, error: (err as Error).message });
    }
  }
}
