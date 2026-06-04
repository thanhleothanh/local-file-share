import type { RegisterMessage } from '@lfs/shared';
import { describe, expect, it, vi } from 'vitest';
import { DeviceRegistry } from '../../packages/server/src/DeviceRegistry';
import { RegisterHandler, buildDeviceListMessage } from '../../packages/server/src/RegisterHandler';

function makeRegistryWithListener() {
  const registry = new DeviceRegistry();
  const broadcast = vi.fn();
  const listener = vi.fn();
  registry.onChange(listener);
  return { registry, broadcast, listener };
}

describe('RegisterHandler', () => {
  it('adds the device to the registry and triggers a broadcast on registry change', () => {
    const { registry, broadcast, listener } = makeRegistryWithListener();
    const handler = new RegisterHandler();
    const client = { readyState: 1 } as never;
    const message = {
      type: 'register',
      from: 'device-1',
      data: { name: 'Alpha' },
      timestamp: 1,
    } as RegisterMessage;
    handler.handle({ client, message, registry, broadcast });
    expect(registry.getById('device-1')?.deviceName).toBe('Alpha');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('uses default name "Unknown" when data.name is missing', () => {
    const { registry, broadcast } = makeRegistryWithListener();
    const handler = new RegisterHandler();
    const message = { type: 'register', from: 'd', data: {}, timestamp: 1 } as unknown as RegisterMessage;
    handler.handle({ client: {} as never, message, registry, broadcast });
    expect(registry.getById('d')?.deviceName).toBe('Unknown');
  });

  it('buildDeviceListMessage returns a properly shaped envelope', () => {
    const message = buildDeviceListMessage([
      { deviceId: 'a', deviceName: 'Alpha', connectedTo: null, registeredAt: 100 },
    ]);
    expect(message.type).toBe('device-list');
    expect(message.from).toBe('server');
    expect(message.data?.devices).toHaveLength(1);
  });
});
