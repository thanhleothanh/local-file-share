import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../packages/client/src/ui/connection-tab';
import type { DeviceDescriptor } from '@lfs/shared';

interface ConnectionTabEl extends HTMLElement {
  devices: readonly DeviceDescriptor[];
  localDeviceId: string;
  dim: boolean;
  updateComplete: Promise<unknown>;
}

function makeDevice(over: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    deviceId: 'a',
    deviceName: 'Alpha',
    connectedTo: null,
    registeredAt: 1,
    ...over,
  };
}

describe('connection-tab', () => {
  let el: ConnectionTabEl;
  beforeEach(() => {
    el = document.createElement('connection-tab') as ConnectionTabEl;
    el.localDeviceId = 'me';
    document.body.appendChild(el);
  });
  afterEach(() => el.remove());

  it('shows "No devices online" empty state when devices list is empty', async () => {
    el.devices = [];
    await el.updateComplete;
    const empty = el.shadowRoot?.querySelector('empty-state') as (HTMLElement & { message: string }) | null;
    expect(empty?.message).toBe('No devices online');
    const text = empty?.shadowRoot?.querySelector('[data-testid="empty-state"]')?.textContent ?? '';
    expect(text).toContain('No devices online');
  });

  it('renders a row per device', async () => {
    el.devices = [makeDevice({ deviceId: 'a' }), makeDevice({ deviceId: 'b', deviceName: 'Bravo' })];
    await el.updateComplete;
    const list = el.shadowRoot?.querySelector('[data-testid="device-list"]');
    expect(list).toBeTruthy();
    const rows = el.shadowRoot?.querySelectorAll('device-row');
    expect(rows?.length).toBe(2);
  });

  it('reflects dim attribute onto host when disconnected', async () => {
    el.dim = true;
    await el.updateComplete;
    expect(el.hasAttribute('dim')).toBe(true);
  });
});
