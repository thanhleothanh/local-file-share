import type {
  AnySignalingMessage,
  AnswerMessage,
  IceCandidateData,
  IceCandidateMessage,
  OfferMessage,
  SdpData,
} from '@lfs/shared';
import { Logger } from '@lfs/shared';
import type { MessageHandler, MessageHandlerContext } from './SignalingRouter.js';

function sendToTarget(
  target: { socket: { send: (data: string) => void } },
  payload: AnySignalingMessage,
): void {
  target.socket.send(JSON.stringify(payload));
}

/**
 * Handler for offer messages - forwards the offer to the target device.
 */
export class OfferHandler implements MessageHandler {
  readonly type = 'offer' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('OfferHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as OfferMessage;
    const targetId = m.to;
    const fromId = m.from;

    if (typeof targetId !== 'string' || typeof fromId !== 'string') {
      this.logger.warn('offer missing to/from fields');
      return;
    }

    const target = registry.getById(targetId);
    if (target === null) {
      this.logger.warn('offer: target device not found', { from: fromId, to: targetId });
      return;
    }

    this.logger.info('offer: forwarding to target', { from: fromId, to: targetId });

    sendToTarget(target, {
      type: 'offer',
      from: fromId,
      to: targetId,
      data: m.data as SdpData,
      timestamp: Date.now(),
    });
  }
}

/**
 * Handler for answer messages - forwards the answer to the requester.
 */
export class AnswerHandler implements MessageHandler {
  readonly type = 'answer' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('AnswerHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as AnswerMessage;
    const targetId = m.to;
    const fromId = m.from;

    if (typeof targetId !== 'string' || typeof fromId !== 'string') {
      this.logger.warn('answer missing to/from fields');
      return;
    }

    const target = registry.getById(targetId);
    if (target === null) {
      this.logger.warn('answer: target device not found', { from: fromId, to: targetId });
      return;
    }

    this.logger.info('answer: forwarding to target', { from: fromId, to: targetId });

    sendToTarget(target, {
      type: 'answer',
      from: fromId,
      to: targetId,
      data: m.data as SdpData,
      timestamp: Date.now(),
    });
  }
}

/**
 * Handler for ice-candidate messages - forwards the candidate to the target device.
 */
export class IceCandidateHandler implements MessageHandler {
  readonly type = 'ice-candidate' as const;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger('IceCandidateHandler');
  }

  handle(ctx: MessageHandlerContext): void {
    const { message, registry } = ctx;
    const m = message as IceCandidateMessage;
    const targetId = m.to;
    const fromId = m.from;

    if (typeof targetId !== 'string' || typeof fromId !== 'string') {
      this.logger.warn('ice-candidate missing to/from fields');
      return;
    }

    const target = registry.getById(targetId);
    if (target === null) {
      this.logger.warn('ice-candidate: target device not found', { from: fromId, to: targetId });
      return;
    }

    this.logger.info('ice-candidate: forwarding to target', { from: fromId, to: targetId });

    sendToTarget(target, {
      type: 'ice-candidate',
      from: fromId,
      to: targetId,
      data: m.data as IceCandidateData,
      timestamp: Date.now(),
    });
  }
}
