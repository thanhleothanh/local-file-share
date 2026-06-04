import { describe, expect, it } from 'vitest';
import { parseSignalingMessage, safeParseSignalingMessage } from '../../packages/server/src/MessageParser';

describe('MessageParser', () => {
  it('parses register messages', () => {
    const msg = parseSignalingMessage(
      JSON.stringify({ type: 'register', from: 'a', data: { name: 'Alpha' } }),
    );
    expect(msg.type).toBe('register');
    if (msg.type === 'register') {
      expect(msg.data?.name).toBe('Alpha');
    }
  });

  it('parses device-list messages', () => {
    const msg = parseSignalingMessage(
      JSON.stringify({ type: 'device-list', from: 'server', data: { devices: [] }, timestamp: 1 }),
    );
    expect(msg.type).toBe('device-list');
  });

  it('parses offer, answer, ice-candidate, connect-request, accept/reject, disconnect, ping, pong, error', () => {
    const types = [
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
    ] as const;
    for (const type of types) {
      const msg = parseSignalingMessage(JSON.stringify({ type, from: 'a', to: 'b', data: {}, timestamp: 1 }));
      expect(msg.type).toBe(type);
    }
  });

  it('throws on malformed JSON', () => {
    expect(() => parseSignalingMessage('not json')).toThrow();
  });

  it('throws on missing type', () => {
    expect(() => parseSignalingMessage(JSON.stringify({ from: 'a' }))).toThrow(/type/);
  });

  it('throws on missing from', () => {
    expect(() => parseSignalingMessage(JSON.stringify({ type: 'register' }))).toThrow(/from/);
  });

  it('throws on unknown type', () => {
    expect(() => parseSignalingMessage(JSON.stringify({ type: 'nope', from: 'a' }))).toThrow(/Unknown/);
  });

  it('throws on non-object payload', () => {
    expect(() => parseSignalingMessage('"hello"')).toThrow();
  });

  it('safeParseSignalingMessage returns ok:true on valid input', () => {
    const result = safeParseSignalingMessage(JSON.stringify({ type: 'register', from: 'a' }));
    expect(result.ok).toBe(true);
  });

  it('safeParseSignalingMessage returns ok:false on invalid input', () => {
    const result = safeParseSignalingMessage('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JSON/);
    }
  });
});
