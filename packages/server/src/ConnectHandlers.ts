import type {
  AcceptConnectMessage,
  AnySignalingMessage,
  ConnectRequestMessage,
  DisconnectMessage,
  RejectConnectMessage,
} from '@lfs/shared';
import { Logger } from '@lfs/shared';
import type { MessageHandler, MessageHandlerContext } from './SignalingRouter.js';

function send(client: { send: (data: string) => void }, payload: AnySignalingMessage): void {
  client.send(JSON.stringify(payload));
}

export class ConnectRequestHandler implements MessageHandler {
  readonly type = 'connect-request' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('ConnectRequestHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { client, message, registry } = ctx;
    const m = message as ConnectRequestMessage;
    const targetId = m.to;
    if (typeof targetId !== 'string' || targetId.length === 0) {
      this.logger.warn('connect-request missing to', { from: m.from });
      return;
    }
    const target = registry.getById(targetId);
    if (target === null) {
      this.logger.info('connect-request target not found', { from: m.from, to: targetId });
      return;
    }
    if (registry.isBusy(targetId)) {
      this.logger.info('connect-request rejected (target busy)', { from: m.from, to: targetId });
      send(client, {
        type: 'connect-rejected',
        from: 'server',
        to: m.from,
        data: { requesterDeviceId: m.from, reason: 'busy' },
        timestamp: Date.now(),
      });
      return;
    }
    this.logger.info('connect-request forwarded', { from: m.from, to: targetId });
    send(target.socket, {
      type: 'connect-request',
      from: m.from,
      to: targetId,
      data: {
        targetDeviceId: targetId,
        requesterName: registry.getById(m.from)?.deviceName ?? 'Unknown',
      },
      timestamp: Date.now(),
    });
  }
}

export class AcceptConnectHandler implements MessageHandler {
  readonly type = 'accept-connect' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('AcceptConnectHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as AcceptConnectMessage;
    const requesterId = m.data?.requesterDeviceId;
    const targetId = m.from;
    if (typeof requesterId !== 'string' || typeof targetId !== 'string') {
      this.logger.warn('accept-connect missing fields', { from: m.from });
      return;
    }
    const requester = registry.getById(requesterId);
    const target = registry.getById(targetId);
    if (requester === null || target === null) {
      this.logger.warn('accept-connect: device not found', { requesterId, targetId });
      return;
    }
    registry.setConnection(requesterId, targetId);
    this.logger.info('connect accepted', { requesterId, targetId });
    send(requester.socket, {
      type: 'connect-accepted',
      from: targetId,
      to: requesterId,
      data: { requesterDeviceId: requesterId },
      timestamp: Date.now(),
    });
  }
}

export class RejectConnectHandler implements MessageHandler {
  readonly type = 'reject-connect' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('RejectConnectHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as RejectConnectMessage;
    const requesterId = m.data?.requesterDeviceId;
    const targetId = m.from;
    if (typeof requesterId !== 'string' || typeof targetId !== 'string') {
      this.logger.warn('reject-connect missing fields', { from: m.from });
      return;
    }
    const requester = registry.getById(requesterId);
    if (requester === null) {
      this.logger.warn('reject-connect: requester not found', { requesterId });
      return;
    }
    this.logger.info('connect rejected', { requesterId, targetId });
    send(requester.socket, {
      type: 'connect-rejected',
      from: targetId,
      to: requesterId,
      data: { requesterDeviceId: requesterId, reason: m.data?.reason ?? 'rejected' },
      timestamp: Date.now(),
    });
  }
}

export class DisconnectHandler implements MessageHandler {
  readonly type = 'disconnect' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('DisconnectHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as DisconnectMessage;
    const targetId = m.data?.targetDeviceId ?? m.to;
    const fromId = m.from;
    if (typeof targetId !== 'string' || typeof fromId !== 'string') {
      this.logger.warn('disconnect missing fields', { from: m.from });
      return;
    }
    const peerId = registry.getById(fromId)?.connectedTo === targetId ? targetId : fromId;
    this.logger.info('disconnect', { from: fromId, target: targetId });
    registry.setConnection(peerId, null);
    const target = registry.getById(targetId);
    if (target !== null) {
      send(target.socket, {
        type: 'device-disconnected' as const,
        from: fromId,
        data: { targetDeviceId: fromId },
        timestamp: Date.now(),
      });
    }
  }
}
