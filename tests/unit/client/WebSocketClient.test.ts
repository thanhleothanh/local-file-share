import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WebSocketClient,
  type WebSocketFactory,
} from '../../../packages/client/src/signaling/WebSocketClient';

type Listener = (ev: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  OPEN = 1;
  CLOSED = 3;
  readyState = 0;
  url: string;
  sent: string[] = [];
  listeners: Record<string, Listener[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]?.push(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  dispatch(type: string, ev: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }

  openWith(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', {});
  }

  receive(data: string): void {
    this.dispatch('message', { data });
  }
}

function makeFactory(): WebSocketFactory {
  return (url) => new MockWebSocket(url) as unknown as WebSocket;
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('WebSocketClient', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
  });

  it('connects, sends register on open, and emits registered event', () => {
    const factory = makeFactory();
    const registered = vi.fn();
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd-1', deviceName: 'Alpha' }),
      logger: silentLogger,
    });
    client.on('registered', registered);
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();

    expect(sock.sent).toHaveLength(1);
    const payload = JSON.parse(sock.sent[0] as string);
    expect(payload).toMatchObject({ type: 'register', from: 'd-1', data: { name: 'Alpha' } });
    expect(registered).toHaveBeenCalledOnce();
  });

  it('emits device-list-updated on device-list messages and logs to devtools', () => {
    const factory = makeFactory();
    const info = vi.fn();
    const updates: unknown[] = [];
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: { info, warn: () => {}, error: () => {} },
    });
    client.on('device-list-updated', (devices) => updates.push(devices));
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    sock.receive(
      JSON.stringify({ type: 'device-list', from: 'server', data: { devices: [{ deviceId: 'a' }] } }),
    );
    expect(updates).toHaveLength(1);
    expect(info).toHaveBeenCalledWith('[WebSocketClient] device-list', expect.anything());
  });

  it('emits incoming-connect-request and peer-disconnected on those types', () => {
    const factory = makeFactory();
    const connectRequests: unknown[] = [];
    const peerDisco: unknown[] = [];
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: silentLogger,
    });
    client.on('incoming-connect-request', (m) => connectRequests.push(m));
    client.on('peer-disconnected', (m) => peerDisco.push(m));
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    sock.receive(
      JSON.stringify({
        type: 'connect-request',
        from: 'a',
        to: 'd',
        data: { targetDeviceId: 'd', requesterName: 'A' },
      }),
    );
    sock.receive(JSON.stringify({ type: 'disconnect', from: 'a', data: { targetDeviceId: 'd' } }));
    expect(connectRequests).toHaveLength(1);
    expect(peerDisco).toHaveLength(1);
  });

  it('emits parse-error on malformed input', () => {
    const factory = makeFactory();
    const errors: unknown[] = [];
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: silentLogger,
    });
    client.on('parse-error', (e) => errors.push(e));
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    sock.receive('not-json');
    expect(errors).toHaveLength(1);
  });

  it('send returns false when socket is not open', () => {
    const factory = makeFactory();
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: silentLogger,
    });
    expect(client.send({ type: 'ping', from: 'd', timestamp: 1 })).toBe(false);
  });

  it('returns false from send if send throws', () => {
    const factory = makeFactory();
    const warn = vi.fn();
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: { info: () => {}, warn, error: () => {} },
    });
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    sock.send = () => {
      throw new Error('boom');
    };
    expect(client.send({ type: 'ping', from: 'd', timestamp: 1 })).toBe(false);
  });

  it('disconnect closes the socket', () => {
    const factory = makeFactory();
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: silentLogger,
    });
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    client.disconnect();
    expect(sock.readyState).toBe(MockWebSocket.CLOSED);
  });
});
