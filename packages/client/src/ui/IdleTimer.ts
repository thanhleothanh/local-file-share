/**
 * IdleTimer - Manages a 10-minute idle timeout timer.
 * 
 * The timer starts when the connection enters CONNECTED state,
 * resets on any control or data channel message, and transitions
 * the connection to IDLE after 10 minutes of inactivity.
 */

export type IdleTimerCallback = () => void;

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export class IdleTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private readonly onTimeout: IdleTimerCallback;
  
  constructor(onTimeout: IdleTimerCallback) {
    this.onTimeout = onTimeout;
  }

  /**
   * Start the idle timer. If already running, this does nothing.
   * After 10 minutes of inactivity, the onTimeout callback is invoked.
   */
  start(): void {
    if (this.timerId !== null) {
      return; // Already running
    }
    
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.onTimeout();
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Reset the timer, restarting the 10-minute countdown.
   * If the timer is not running, this starts it.
   */
  reset(): void {
    this.stop();
    this.start();
  }

  /**
   * Stop the timer without invoking the callback.
   * The timer can be restarted with start() or reset().
   */
  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Check if the timer is currently running.
   */
  isRunning(): boolean {
    return this.timerId !== null;
  }

  /**
   * Get the idle timeout duration in milliseconds.
   */
  static get IDLE_TIMEOUT_MS(): number {
    return IDLE_TIMEOUT_MS;
  }
}
