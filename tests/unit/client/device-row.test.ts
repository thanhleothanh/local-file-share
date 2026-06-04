import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/device-row';
import type { DeviceDescriptor } from '@lfs/shared';

function makeDevice(over: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    deviceId: 'a',
    deviceName: 'Alpha',
    connectedTo: null,
    registeredAt: 1,
    ...over,
  };
}

interface DeviceRowEl extends HTMLElement {
  device: DeviceDescriptor | null;
  isSelf: boolean;
  busy: boolean;
  dim: boolean;
  updateComplete: Promise<unknown>;
}

describe('device-row', () => {
  let el: DeviceRowEl;
  beforeEach(async () => {
    el = document.createElement('device-row') as DeviceRowEl;
    el.device = makeDevice();
    el.isSelf = false;
    el.busy = false;
    document.body.appendChild(el);
    await el.updateComplete;
  });
  afterEach(() => el.remove());

  it('renders the device name', () => {
    const name = el.shadowRoot?.querySelector('.name')?.textContent;
    expect(name).toContain('Alpha');
  });

  it('renders a "You" badge when isSelf=true and no Connect button', () => {
    el.isSelf = true;
    el.device = makeDevice({ deviceId: 'me' });
    return el.updateComplete.then(() => {
      const badge = el.shadowRoot?.querySelector('[data-testid="you-badge"]');
      const button = el.shadowRoot?.querySelector('[data-testid="connect-button"]');
      expect(badge).toBeTruthy();
      expect(button).toBeNull();
    });
  });

  it('Connect button is disabled when device.connectedTo is set', async () => {
    el.device = makeDevice({ connectedTo: 'someone' });
    await el.updateComplete;
    const button = el.shadowRoot?.querySelector('[data-testid="connect-button"]') as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent?.trim()).toBe('Busy');
  });

  it('emits connect-clicked when Connect is clicked and not busy', async () => {
    const detail = await new Promise<{ deviceId: string }>((resolve) => {
      el.addEventListener('connect-clicked', (ev) =>
        resolve((ev as CustomEvent<{ deviceId: string }>).detail),
      );
      const button = el.shadowRoot?.querySelector(
        '[data-testid="connect-button"]',
      ) as HTMLButtonElement | null;
      button?.click();
    });
    expect(detail.deviceId).toBe('a');
  });
});
