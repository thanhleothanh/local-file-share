import {
  CONNECTION_EVENTS,
  CONNECTION_STATES,
  type ConnectionEvent,
  ConnectionState,
  InvalidTransitionError,
  transition,
} from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('transition()', () => {
  const VALID: Array<[ConnectionState, ConnectionEvent, ConnectionState]> = [
    [ConnectionState.IDLE, 'REQUEST_CONNECT', ConnectionState.CONNECTING],
    [ConnectionState.CONNECTING, 'CONNECT_ACCEPTED', ConnectionState.CONNECTED],
    [ConnectionState.CONNECTING, 'CONNECT_REJECTED', ConnectionState.IDLE],
    [ConnectionState.CONNECTING, 'PEER_CANCELLED', ConnectionState.IDLE],
    [ConnectionState.CONNECTING, 'ERROR', ConnectionState.IDLE],
    [ConnectionState.CONNECTED, 'DISCONNECT', ConnectionState.IDLE],
    [ConnectionState.CONNECTED, 'ERROR', ConnectionState.IDLE],
  ];

  it.each(VALID)('transition(%s, %s) -> %s', (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  it('throws InvalidTransitionError for invalid transitions', () => {
    expect(() => transition(ConnectionState.IDLE, 'CONNECT_ACCEPTED')).toThrow(InvalidTransitionError);
    expect(() => transition(ConnectionState.IDLE, 'DISCONNECT')).toThrow(InvalidTransitionError);
    expect(() => transition(ConnectionState.IDLE, 'ERROR')).toThrow(InvalidTransitionError);
    expect(() => transition(ConnectionState.IDLE, 'PEER_CANCELLED')).toThrow(InvalidTransitionError);
  });

  it('throws for every invalid (state, event) pair', () => {
    for (const state of CONNECTION_STATES) {
      for (const event of CONNECTION_EVENTS) {
        const isValid = VALID.some(([s, e]) => s === state && e === event);
        if (!isValid) {
          expect(() => transition(state, event)).toThrow(InvalidTransitionError);
        }
      }
    }
  });

  it('InvalidTransitionError exposes from and event', () => {
    try {
      transition(ConnectionState.IDLE, 'CONNECT_ACCEPTED');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.from).toBe(ConnectionState.IDLE);
      expect(e.event).toBe('CONNECT_ACCEPTED');
      expect(e.message).toMatch(/IDLE/);
      expect(e.message).toMatch(/CONNECT_ACCEPTED/);
    }
  });
});
