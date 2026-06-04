import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleTimer } from './IdleTimer.js';

describe('IdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not call onTimeout if not started', () => {
    const callback = vi.fn();
    new IdleTimer(callback);

    // Advance time past the timeout
    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should call onTimeout after 10 minutes when started', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();

    // Advance time by 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should not call onTimeout if stopped before timeout', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();

    // Stop before timeout
    vi.advanceTimersByTime(5 * 60 * 1000);
    timer.stop();

    // Advance past where timeout would have been
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should not call onTimeout twice if start is called multiple times', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();
    timer.start(); // Should be a no-op
    timer.start(); // Should be a no-op

    // Advance time by 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should reset the timer when reset is called', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();

    // Advance 9 minutes
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(callback).not.toHaveBeenCalled();

    // Reset the timer
    timer.reset();

    // Advance another 9 minutes (18 total) - should not have timed out yet
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(callback).not.toHaveBeenCalled();

    // Advance 1 more minute (19 total, 10 since reset) - should timeout
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should start a new timer if reset is called when not running', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    // Reset without starting first
    timer.reset();

    // Advance time by 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should stop the timer and prevent callback when stop is called', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();

    // Advance 9 minutes
    vi.advanceTimersByTime(9 * 60 * 1000);

    // Stop the timer
    timer.stop();

    // Advance 2 more minutes
    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should report isRunning correctly', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    expect(timer.isRunning()).toBe(false);

    timer.start();
    expect(timer.isRunning()).toBe(true);

    timer.stop();
    expect(timer.isRunning()).toBe(false);
  });

  it('should have IDLE_TIMEOUT_MS as 10 minutes', () => {
    expect(IdleTimer.IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });

  it('should allow restarting after timeout', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    timer.start();

    // Let it timeout
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(timer.isRunning()).toBe(false);

    // Start again
    callback.mockClear();
    timer.start();

    // Let it timeout again
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should allow multiple start/stop cycles', () => {
    const callback = vi.fn();
    const timer = new IdleTimer(callback);

    // First cycle
    timer.start();
    vi.advanceTimersByTime(5 * 60 * 1000);
    timer.stop();

    // Second cycle
    timer.start();
    vi.advanceTimersByTime(5 * 60 * 1000);
    timer.stop();

    // Third cycle - let it complete
    timer.start();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
