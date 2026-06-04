import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../packages/client/src/ui/toast-notification';
import type { ToastNotification, ToastType } from '../../../packages/client/src/ui/toast-notification';

describe('ToastNotification', () => {
  let element: ToastNotification;

  beforeEach(() => {
    element = document.createElement('toast-notification') as ToastNotification;
  });

  afterEach(() => {
    element.remove();
  });

  it('is registered as a custom element', () => {
    expect(customElements.get('toast-notification')).toBeDefined();
  });

  it('uses role="alert" for error type', async () => {
    element.type = 'error';
    element.message = 'Boom';
    document.body.appendChild(element);
    await element.updateComplete;
    expect(element.getAttribute('role')).toBe('alert');
  });

  it('uses role="status" for non-error types', async () => {
    for (const type of ['success', 'info', 'warning'] as const) {
      const el = document.createElement('toast-notification') as ToastNotification;
      el.type = type;
      el.message = 'msg';
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.getAttribute('role')).toBe('status');
      el.remove();
    }
  });

  it('renders the message inside a <p>', async () => {
    element.type = 'info';
    element.message = 'Hello world';
    document.body.appendChild(element);
    await element.updateComplete;
    const p = element.shadowRoot?.querySelector('p.toast-message');
    expect(p?.textContent).toBe('Hello world');
  });

  it('marks the icon aria-hidden', async () => {
    element.type = 'success';
    element.message = 'x';
    document.body.appendChild(element);
    await element.updateComplete;
    const icon = element.shadowRoot?.querySelector('[data-testid="toast-icon"]');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the right icon for each type', async () => {
    const expected: Record<ToastType, string> = {
      error: '\u2715',
      success: '\u2713',
      info: '\u2139',
      warning: '\u26A0',
    };
    for (const [type, icon] of Object.entries(expected) as [ToastType, string][]) {
      const el = document.createElement('toast-notification') as ToastNotification;
      el.type = type;
      el.message = 'm';
      document.body.appendChild(el);
      await el.updateComplete;
      const iconEl = el.shadowRoot?.querySelector('[data-testid="toast-icon"]');
      expect(iconEl?.textContent).toBe(icon);
      el.remove();
    }
  });

  it('applies a data-variant attribute matching the type', async () => {
    element.type = 'warning';
    element.message = 'x';
    document.body.appendChild(element);
    await element.updateComplete;
    expect(element.getAttribute('data-variant')).toBe('warning');
  });

  it('supports dismissed event', async () => {
    vi.useFakeTimers();
    element.type = 'info';
    element.message = 'x';
    document.body.appendChild(element);
    await element.updateComplete;
    const handler = vi.fn();
    element.addEventListener('toast-dismissed', handler);
    element.dismiss();
    vi.advanceTimersByTime(250);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
