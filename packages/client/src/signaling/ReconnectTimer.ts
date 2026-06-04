const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onSchedule?: (delayMs: number, attempt: number) => void;
  onServerReconnected?: () => void;
  onServerDisconnected?: () => void;
}

export class ReconnectTimer {
  private attempt = 0;
  private cancelled = false;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly onSchedule: ((delayMs: number, attempt: number) => void) | null;
  private readonly onServerReconnected: (() => void) | null;
  private readonly onServerDisconnected: (() => void) | null;

  constructor(options: ReconnectOptions = {}) {
    this.initialDelay = options.initialDelayMs ?? INITIAL_DELAY_MS;
    this.maxDelay = options.maxDelayMs ?? MAX_DELAY_MS;
    this.sleepFn = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onSchedule = options.onSchedule ?? null;
    this.onServerReconnected = options.onServerReconnected ?? null;
    this.onServerDisconnected = options.onServerDisconnected ?? null;
  }

  reset(): void {
    this.attempt = 0;
  }

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  computeDelay(attempt: number): number {
    const exp = this.initialDelay * 2 ** (attempt - 1);
    return Math.min(exp, this.maxDelay);
  }

  async runOnce(onAttempt: () => Promise<boolean>): Promise<boolean> {
    this.cancelled = false;
    return this.doRun(onAttempt);
  }

  private async doRun(onAttempt: () => Promise<boolean>): Promise<boolean> {
    if (this.attempt === 0) {
      this.onServerDisconnected?.();
    }
    while (!this.cancelled) {
      this.attempt += 1;
      const delay = this.computeDelay(this.attempt);
      this.onSchedule?.(delay, this.attempt);
      await this.sleepFn(delay);
      if (this.cancelled) return false;
      const ok = await onAttempt();
      if (ok) {
        this.attempt = 0;
        this.onServerReconnected?.();
        return true;
      }
    }
    return false;
  }
}
