import { WebRTCConnection } from '../../../packages/client/src/webrtc/WebRTCConnection.js';
import { describe, expect, it, vi } from 'vitest';

class MockWebSocketClient {
  readonly sent: unknown[] = [];
  on(_event: string, _handler: (payload: unknown) => void): () => void {
    return () => {};
  }
  send(message: unknown): boolean {
    this.sent.push(message);
    return true;
  }
}

describe('WebRTCConnection', () => {
  it('close is idempotent', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    // Close should work
    conn.close();
    expect(conn.getPeer()).toBeNull();
    expect(conn.getChannels()).toBeNull();

    // Second close should not throw
    expect(() => conn.close()).not.toThrow();
  });

  it('getChannels returns null initially', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    expect(conn.getChannels()).toBeNull();
  });

  it('getPeer returns null initially', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    expect(conn.getPeer()).toBeNull();
  });

  it('on method allows subscribing to events', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    const handler = vi.fn();
    const unsubscribe = conn.on('data-channel-open', handler);

    // Manually trigger the event (simulating internal behavior)
    // This tests that the subscription mechanism works
    (conn as any).emit('data-channel-open', { control: null, data: null });

    expect(handler).toHaveBeenCalled();

    // Unsubscribe
    unsubscribe();
    (conn as any).emit('data-channel-open', { control: null, data: null });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sendControl returns false when control channel not ready', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    // Control channel is not open initially
    expect(conn.sendControl('test')).toBe(false);
  });

  it('sendData returns false when data channel not ready', () => {
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const client = new MockWebSocketClient();
    const conn = new WebRTCConnection({
      signalingClient: client as any,
      localDeviceId: 'device-a',
      targetDeviceId: 'device-b',
      isOfferer: true,
    });

    // Data channel is not open initially
    expect(conn.sendData(new ArrayBuffer(0))).toBe(false);
  });
});
