import type { AnySignalingMessage, SignalingEnvelope, SignalingMessageType } from '@lfs/shared';

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

export interface ParseResult {
  ok: true;
  message: AnySignalingMessage;
}

export interface ParseFailure {
  ok: false;
  error: string;
  raw: string;
}

export function parseSignalingMessage(raw: string): AnySignalingMessage {
  if (typeof raw !== 'string') {
    throw new Error('Message must be a string');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('Message must be an object');
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== 'string') {
    throw new Error('Missing string field: type');
  }
  if (typeof obj.from !== 'string') {
    throw new Error('Missing string field: from');
  }
  const type = obj.type as SignalingMessageType;
  if (!KNOWN_TYPES.has(type)) {
    throw new Error(`Unknown message type: ${type}`);
  }
  const envelope: SignalingEnvelope = {
    type,
    from: obj.from as string,
    ...(typeof obj.to === 'string' ? { to: obj.to } : {}),
    ...(obj.data !== undefined ? { data: obj.data } : {}),
    ...(typeof obj.timestamp === 'number' ? { timestamp: obj.timestamp } : { timestamp: Date.now() }),
  };
  return envelope as AnySignalingMessage;
}

export function safeParseSignalingMessage(raw: string): ParseResult | ParseFailure {
  try {
    return { ok: true, message: parseSignalingMessage(raw) };
  } catch (err) {
    return { ok: false, error: (err as Error).message, raw };
  }
}
