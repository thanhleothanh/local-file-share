import { ReconnectTimer } from './ReconnectTimer.js';
import type { WebSocketClient } from './WebSocketClient.js';

export interface AutoReconnectOptions {
  client: WebSocketClient;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onServerDisconnected?: () => void;
  onServerReconnected?: () => void;
  onSchedule?: (delayMs: number, attempt: number) => void;
}

export class WebSocketAutoReconnect {
  private readonly client: WebSocketClient;
  private readonly timer: ReconnectTimer;
  private unsubscribe: (() => void) | null = null;

  constructor(options: AutoReconnectOptions) {
    this.client = options.client;
    this.timer = new ReconnectTimer({
      ...(options.initialDelayMs !== undefined ? { initialDelayMs: options.initialDelayMs } : {}),
      ...(options.maxDelayMs !== undefined ? { maxDelayMs: options.maxDelayMs } : {}),
      ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
      ...(options.onSchedule !== undefined ? { onSchedule: options.onSchedule } : {}),
      ...(options.onServerDisconnected !== undefined
        ? { onServerDisconnected: options.onServerDisconnected }
        : {}),
      ...(options.onServerReconnected !== undefined
        ? { onServerReconnected: options.onServerReconnected }
        : {}),
    });
  }

  start(): void {
    if (this.unsubscribe !== null) {
      return;
    }
    this.unsubscribe = this.client.on('close', () => {
      void this.scheduleReconnect();
    });
    this.client.on('registered', () => {
      this.timer.reset();
    });
  }

  stop(): void {
    this.timer.cancel();
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private async scheduleReconnect(): Promise<void> {
    await this.timer.runOnce(async () => {
      try {
        this.client.connect();
        return true;
      } catch {
        return false;
      }
    });
  }
}
