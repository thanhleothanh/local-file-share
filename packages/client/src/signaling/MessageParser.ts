import type { AnySignalingMessage, SignalingMessageType } from '@lfs/shared';

const KNOWN_TYPES = new Set<SignalingMessageType>([
  'register',
  'device-list',
  'offer',
  'answer',
  'ice-candidate',
  'connect-request',
  'accept-connect',
  'reject-connect',
  'disconnect',
  'ping',
  'pong',
  'error',
]);

export class MessageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageParseError';
  }
}

export function parseClientMessage(raw: string): AnySignalingMessage {
  if (typeof raw !== 'string') {
    throw new MessageParseError('Message must be a string');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    throw new MessageParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (typeof value !== 'object' || value === null) {
    throw new MessageParseError('Message must be an object');
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== 'string') {
    throw new MessageParseError('Missing string field: type');
  }
  if (typeof obj.from !== 'string') {
    throw new MessageParseError('Missing string field: from');
  }
  const type = obj.type as SignalingMessageType;
  if (!KNOWN_TYPES.has(type)) {
    throw new MessageParseError(`Unknown message type: ${type}`);
  }
  return {
    type,
    from: obj.from as string,
    ...(typeof obj.to === 'string' ? { to: obj.to } : {}),
    ...(obj.data !== undefined ? { data: obj.data } : {}),
    ...(typeof obj.timestamp === 'number' ? { timestamp: obj.timestamp } : { timestamp: Date.now() }),
  } as AnySignalingMessage;
}
