import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastManager, resetToastManager, toast } from '../../../packages/client/src/ui/toast-manager';

describe('ToastManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetToastManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    resetToastManager();
  });

  it('lazily creates a container on first call', () => {
    expect(document.querySelector('.toast-container')).toBeNull();
    toast('info', 'hi');
    expect(document.querySelector('.toast-container')).not.toBeNull();
  });

  it('appends a toast with role="alert" for error type', () => {
    toast('error', 'Boom');
    const container = document.querySelector('.toast-container');
    expect(container).not.toBeNull();
    const el = container?.querySelector('toast-notification');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('alert');
  });

  it('appends a toast with role="status" for success type', () => {
    toast('success', 'OK');
    const el = document.querySelector('toast-notification');
    expect(el?.getAttribute('role')).toBe('status');
  });

  it('auto-dismisses after 2000 ms', () => {
    toast('info', 'Hello');
    const container = document.querySelector('.toast-container');
    expect(container?.querySelector('toast-notification')).not.toBeNull();
    vi.advanceTimersByTime(2200);
    expect(container?.querySelector('toast-notification')).toBeNull();
  });

  it('stacks multiple toasts vertically and dismisses independently', () => {
    toast('error', 'first');
    toast('success', 'second');
    toast('info', 'third');
    const container = document.querySelector('.toast-container');
    const toasts = container?.querySelectorAll('toast-notification');
    expect(toasts?.length).toBe(3);
    vi.advanceTimersByTime(2200);
    expect(container?.querySelectorAll('toast-notification').length).toBe(0);
  });

  it('container has aria-live=polite and aria-atomic=false', () => {
    toast('info', 'x');
    const container = document.querySelector('.toast-container');
    expect(container?.getAttribute('aria-live')).toBe('polite');
    expect(container?.getAttribute('aria-atomic')).toBe('false');
  });

  it('container uses flex column layout', () => {
    toast('info', 'x');
    const container = document.querySelector('.toast-container') as HTMLElement | null;
    expect(container).not.toBeNull();
    const style = container?.getAttribute('style') ?? '';
    expect(style).toMatch(/display:\s*flex/);
    expect(style).toMatch(/flex-direction:\s*column/);
  });

  it('container is position: fixed', () => {
    toast('info', 'x');
    const container = document.querySelector('.toast-container') as HTMLElement | null;
    const style = container?.getAttribute('style') ?? '';
    expect(style).toMatch(/position:\s*fixed/);
  });

  it('exposes a singleton manager via getToastManager', () => {
    const a = ToastManager.instance();
    const b = ToastManager.instance();
    expect(a).toBe(b);
  });

  it('toast() delegates to manager.show with right arguments', () => {
    const spy = vi.spyOn(ToastManager.instance(), 'show');
    toast('warning', 'careful');
    expect(spy).toHaveBeenCalledWith('warning', 'careful');
  });
});
