import { describe, expect, it } from 'vitest';
import { MessageParseError, parseClientMessage } from '../../../packages/client/src/signaling/MessageParser';

describe('parseClientMessage', () => {
  it('parses a register message', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'register', from: 'a', data: { name: 'Alpha' } }));
    expect(msg.type).toBe('register');
  });

  it('parses a device-list message', () => {
    const msg = parseClientMessage(
      JSON.stringify({ type: 'device-list', from: 'server', data: { devices: [] }, timestamp: 1 }),
    );
    expect(msg.type).toBe('device-list');
  });

  it('parses all known message types', () => {
    const types = [
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
    ];
    for (const type of types) {
      const msg = parseClientMessage(JSON.stringify({ type, from: 'a' }));
      expect(msg.type).toBe(type);
    }
  });

  it('throws MessageParseError on invalid JSON', () => {
    expect(() => parseClientMessage('not json')).toThrow(MessageParseError);
  });

  it('throws when type is missing', () => {
    expect(() => parseClientMessage(JSON.stringify({ from: 'a' }))).toThrow(/type/);
  });

  it('throws when from is missing', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'register' }))).toThrow(/from/);
  });

  it('throws on unknown type', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'foo', from: 'a' }))).toThrow(/Unknown/);
  });
});
