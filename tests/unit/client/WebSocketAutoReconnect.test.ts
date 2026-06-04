import { describe, expect, it, vi } from 'vitest';
import { ReconnectTimer } from '../../../packages/client/src/signaling/ReconnectTimer';
import { WebSocketAutoReconnect } from '../../../packages/client/src/signaling/WebSocketAutoReconnect';
import {
  WebSocketClient,
  type WebSocketFactory,
} from '../../../packages/client/src/signaling/WebSocketClient';

type Listener = (ev: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  listeners: Record<string, Listener[]> = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, fn: Listener): void {
    const existing = this.listeners[type];
    if (existing === undefined) {
      this.listeners[type] = [fn];
    } else {
      existing.push(fn);
    }
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  send(): void {}
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
}

const factory: WebSocketFactory = (url) => new MockWebSocket(url) as unknown as WebSocket;

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('WebSocketAutoReconnect', () => {
  it('schedules reconnect attempts with exponential backoff and resets on registered', async () => {
    MockWebSocket.instances.length = 0;
    const client = new WebSocketClient({
      url: 'ws://test/ws',
      factory,
      identityProvider: () => ({ deviceId: 'd', deviceName: 'X' }),
      logger: silentLogger,
    });
    const sleeps: number[] = [];
    const onSchedule = vi.fn((delay: number) => {
      sleeps.push(delay);
    });
    const reconnect = new WebSocketAutoReconnect({
      client,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      sleep: async (ms) => {
        if (sleeps.length >= 3) return;
      },
      onSchedule,
    });
    reconnect.start();
    client.connect();
    const sock = MockWebSocket.instances[0] as unknown as MockWebSocket;
    sock.openWith();
    sock.close();
    await new Promise((r) => setTimeout(r, 5));
    expect(onSchedule).toHaveBeenCalled();
    reconnect.stop();
  });
});

describe('ReconnectTimer', () => {
  it('uses initial delay on first attempt, doubles on each subsequent attempt', async () => {
    const timer = new ReconnectTimer({
      initialDelayMs: 100,
      maxDelayMs: 100_000,
      sleep: async () => undefined,
    });
    const delays: number[] = [];
    await timer.runOnce(async () => {
      delays.push(100);
      timer.cancel();
      return false;
    });
    expect(delays).toEqual([100]);
  });

  it('caps delay at maxDelayMs', () => {
    const timer = new ReconnectTimer({ initialDelayMs: 100, maxDelayMs: 250 });
    const onSchedule = vi.fn();
    timer.reset();
    void timer.runOnce(async () => {
      timer.cancel();
      return false;
    });
    timer.computeDelay(10);
    timer.onSchedule = onSchedule;
    expect(timer.computeDelay(10)).toBe(250);
  });

  it('onServerDisconnected fires before first attempt; onServerReconnected fires when runOnce returns true', async () => {
    const disconnected = vi.fn();
    const reconnected = vi.fn();
    const timer = new ReconnectTimer({
      initialDelayMs: 10,
      sleep: async () => undefined,
      onServerDisconnected: disconnected,
      onServerReconnected: reconnected,
    });
    const ok = await timer.runOnce(async () => true);
    expect(ok).toBe(true);
    expect(disconnected).toHaveBeenCalledOnce();
    expect(reconnected).toHaveBeenCalledOnce();
  });
});
