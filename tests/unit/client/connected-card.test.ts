import '../../../packages/client/src/ui/connected-card';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectedCard } from '../../../packages/client/src/ui/connected-card';

describe('connected-card', () => {
  let el: ConnectedCard;

  beforeEach(() => {
    el = document.createElement('connected-card') as ConnectedCard;
  });

  afterEach(() => {
    el.remove();
  });

  it('is registered as a custom element', () => {
    expect(customElements.get('connected-card')).toBeDefined();
  });

  it('shows "Connected to" label in connected mode', async () => {
    el.peerName = 'Bob';
    el.mode = 'connected';
    document.body.appendChild(el);
    await el.updateComplete;
    const label = el.shadowRoot?.querySelector('[data-testid="connected-label"]');
    expect(label?.textContent?.trim()).toBe('Connected to');
    const name = el.shadowRoot?.querySelector('[data-testid="connected-peer-name"]');
    expect(name?.textContent).toBe('Bob');
  });

  it('shows "Connecting to" label in connecting mode', async () => {
    el.peerName = 'Bob';
    el.mode = 'connecting';
    document.body.appendChild(el);
    await el.updateComplete;
    const label = el.shadowRoot?.querySelector('[data-testid="connecting-label"]');
    expect(label?.textContent?.trim()).toBe('Connecting to');
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="cancel-connect"]');
    expect(btn?.textContent?.trim()).toBe('Cancel');
  });

  it('emits disconnect-clicked in connected mode', async () => {
    el.peerName = 'Bob';
    el.mode = 'connected';
    document.body.appendChild(el);
    await el.updateComplete;
    let fired = false;
    el.addEventListener('disconnect-clicked', () => {
      fired = true;
    });
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="disconnect"]');
    btn?.click();
    expect(fired).toBe(true);
  });

  it('emits cancel-clicked in connecting mode', async () => {
    el.peerName = 'Bob';
    el.mode = 'connecting';
    document.body.appendChild(el);
    await el.updateComplete;
    let fired = false;
    el.addEventListener('cancel-clicked', () => {
      fired = true;
    });
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="cancel-connect"]');
    btn?.click();
    expect(fired).toBe(true);
  });
});
