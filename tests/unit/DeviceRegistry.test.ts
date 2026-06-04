import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceRegistry } from '../../packages/server/src/DeviceRegistry';
import type { Device } from '../../packages/server/src/DeviceRegistry';

function makeDevice(id: string, name: string, connectedTo: string | null = null): Device {
  return {
    deviceId: id,
    deviceName: name,
    socket: { readyState: 1, OPEN: 1 } as unknown as Device['socket'],
    connectedTo,
    registeredAt: Date.now(),
  };
}

describe('DeviceRegistry', () => {
  let registry: DeviceRegistry;

  beforeEach(() => {
    registry = new DeviceRegistry();
  });

  it('register adds a device; getAll returns it', () => {
    const d = makeDevice('a', 'Alpha');
    registry.register(d);
    expect(registry.getAll()).toEqual([d]);
  });

  it('getById returns the device when present, null when not', () => {
    registry.register(makeDevice('a', 'Alpha'));
    expect(registry.getById('a')?.deviceName).toBe('Alpha');
    expect(registry.getById('zzz')).toBeNull();
  });

  it('unregister removes the device and returns true; returns false when missing', () => {
    registry.register(makeDevice('a', 'Alpha'));
    expect(registry.unregister('a')).toBe(true);
    expect(registry.getById('a')).toBeNull();
    expect(registry.unregister('a')).toBe(false);
  });

  it('isBusy returns false initially and true after setConnection', () => {
    registry.register(makeDevice('a', 'Alpha'));
    registry.register(makeDevice('b', 'Bravo'));
    expect(registry.isBusy('a')).toBe(false);
    registry.setConnection('a', 'b');
    expect(registry.isBusy('a')).toBe(true);
    expect(registry.isBusy('b')).toBe(true);
  });

  it('onChange fires with descriptor list on every mutation', () => {
    const listener = vi.fn();
    registry.onChange(listener);
    registry.register(makeDevice('a', 'Alpha'));
    registry.register(makeDevice('b', 'Bravo'));
    registry.unregister('a');
    expect(listener).toHaveBeenCalledTimes(3);
    const lastCall = listener.mock.calls[2]?.[0] as Array<{ deviceId: string }>;
    expect(lastCall.map((d) => d.deviceId)).toEqual(['b']);
  });

  it('toDescriptors strips the socket from the public view', () => {
    registry.register(makeDevice('a', 'Alpha', 'b'));
    const descriptors = registry.toDescriptors();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).not.toHaveProperty('socket');
    expect(descriptors[0]?.connectedTo).toBe('b');
  });
});
