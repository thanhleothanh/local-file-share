import '../../../packages/client/src/ui/incoming-prompt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingPrompt } from '../../../packages/client/src/ui/incoming-prompt';

describe('incoming-prompt', () => {
  let el: IncomingPrompt;

  beforeEach(() => {
    el = document.createElement('incoming-prompt') as IncomingPrompt;
  });

  afterEach(() => {
    el.remove();
  });

  it('is registered as a custom element', () => {
    expect(customElements.get('incoming-prompt')).toBeDefined();
  });

  it('renders the requester name in the text', async () => {
    el.fromDeviceName = 'Alpha';
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.shadowRoot?.querySelector('[data-testid="incoming-prompt-text"]');
    expect(text?.textContent).toContain('Alpha');
    expect(text?.textContent).toMatch(/connect/i);
  });

  it('emits accept-incoming when the Accept button is clicked', async () => {
    el.fromDeviceName = 'A';
    document.body.appendChild(el);
    await el.updateComplete;
    let fired = false;
    el.addEventListener('accept-incoming', () => {
      fired = true;
    });
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="accept-incoming"]');
    expect(btn).not.toBeNull();
    btn?.click();
    expect(fired).toBe(true);
  });

  it('emits reject-incoming when the Reject button is clicked', async () => {
    el.fromDeviceName = 'A';
    document.body.appendChild(el);
    await el.updateComplete;
    let fired = false;
    el.addEventListener('reject-incoming', () => {
      fired = true;
    });
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="reject-incoming"]');
    btn?.click();
    expect(fired).toBe(true);
  });
});
