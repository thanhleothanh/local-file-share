import {
  CONNECTION_EVENTS,
  CONNECTION_STATES,
  ConnectionState,
  getValidEventsForConnection,
  isConnectionState,
  isValidConnectionTransition,
} from '@lfs/shared';
import { describe, expect, it } from 'vitest';

describe('ConnectionState', () => {
  it('exposes exactly 3 states', () => {
    expect(CONNECTION_STATES).toHaveLength(3);
  });

  it('contains IDLE, CONNECTING, CONNECTED', () => {
    expect(CONNECTION_STATES).toEqual([
      ConnectionState.IDLE,
      ConnectionState.CONNECTING,
      ConnectionState.CONNECTED,
    ]);
  });

  it('isConnectionState accepts valid states', () => {
    expect(isConnectionState('IDLE')).toBe(true);
    expect(isConnectionState('CONNECTED')).toBe(true);
  });

  it('isConnectionState rejects unknown values', () => {
    expect(isConnectionState('PENDING')).toBe(false);
    expect(isConnectionState(42)).toBe(false);
    expect(isConnectionState(undefined)).toBe(false);
  });

  it('IDLE can only INITIATE_CONNECT', () => {
    expect(getValidEventsForConnection(ConnectionState.IDLE)).toEqual(['INITIATE_CONNECT']);
  });

  it('CONNECTING can ACCEPT, REJECT, ERROR, DISCONNECT', () => {
    const events = getValidEventsForConnection(ConnectionState.CONNECTING);
    expect(events).toContain('ACCEPT');
    expect(events).toContain('REJECT');
    expect(events).toContain('ERROR');
    expect(events).toContain('DISCONNECT');
  });

  it('CONNECTED can DISCONNECT and ERROR', () => {
    const events = getValidEventsForConnection(ConnectionState.CONNECTED);
    expect(events).toContain('DISCONNECT');
    expect(events).toContain('ERROR');
  });

  it('isValidConnectionTransition matches transition table for all pairs', () => {
    for (const state of CONNECTION_STATES) {
      for (const event of CONNECTION_EVENTS) {
        const expected = getValidEventsForConnection(state).includes(event);
        expect(isValidConnectionTransition(state, event)).toBe(expected);
      }
    }
  });
});
