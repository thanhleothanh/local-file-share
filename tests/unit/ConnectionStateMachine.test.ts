import {
  type ConnectionEvent,
  ConnectionState,
  ConnectionStateMachine,
  InvalidTransitionError,
} from '@lfs/shared';
import { describe, expect, it, vi } from 'vitest';

describe('ConnectionStateMachine', () => {
  it('starts in IDLE', () => {
    const sm = new ConnectionStateMachine();
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('dispatch() advances the state for valid events', () => {
    const sm = new ConnectionStateMachine();
    sm.dispatch('REQUEST_CONNECT');
    expect(sm.state).toBe(ConnectionState.CONNECTING);
    sm.dispatch('CONNECT_ACCEPTED');
    expect(sm.state).toBe(ConnectionState.CONNECTED);
    sm.dispatch('DISCONNECT');
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('emits a transition event with from, to, event', () => {
    const sm = new ConnectionStateMachine();
    const handler = vi.fn();
    sm.addEventListener('transition', handler);
    sm.dispatch('REQUEST_CONNECT');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          from: ConnectionState.IDLE,
          to: ConnectionState.CONNECTING,
          event: 'REQUEST_CONNECT' as ConnectionEvent,
        },
      }),
    );
  });

  it('throws InvalidTransitionError on illegal event from current state', () => {
    const sm = new ConnectionStateMachine();
    expect(() => sm.dispatch('CONNECT_ACCEPTED')).toThrow(InvalidTransitionError);
  });

  it('does not change state on illegal dispatch (after error)', () => {
    const sm = new ConnectionStateMachine();
    try {
      sm.dispatch('DISCONNECT');
    } catch {
      // expected
    }
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('throws from CONNECTING with PEER_CANCELLED goes back to IDLE', () => {
    const sm = new ConnectionStateMachine();
    sm.dispatch('REQUEST_CONNECT');
    sm.dispatch('PEER_CANCELLED');
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('throws from CONNECTING with ERROR goes back to IDLE', () => {
    const sm = new ConnectionStateMachine();
    sm.dispatch('REQUEST_CONNECT');
    sm.dispatch('ERROR');
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('throws from CONNECTED with ERROR goes back to IDLE', () => {
    const sm = new ConnectionStateMachine();
    sm.dispatch('REQUEST_CONNECT');
    sm.dispatch('CONNECT_ACCEPTED');
    sm.dispatch('ERROR');
    expect(sm.state).toBe(ConnectionState.IDLE);
  });

  it('can be reset to a given state', () => {
    const sm = new ConnectionStateMachine();
    sm.dispatch('REQUEST_CONNECT');
    sm.reset(ConnectionState.IDLE);
    expect(sm.state).toBe(ConnectionState.IDLE);
  });
});
