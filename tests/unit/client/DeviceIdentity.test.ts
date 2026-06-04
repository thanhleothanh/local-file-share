import { beforeEach, describe, expect, it } from 'vitest';
import { DeviceIdentity } from '../../../packages/client/src/identity/DeviceIdentity';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('DeviceIdentity', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('returns a new id and generated name when storage is empty', () => {
    const identity = new DeviceIdentity({ userAgent: 'iPhone', storage });
    const { deviceId, deviceName } = identity.getOrCreate();
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceName).toBe('Mobile #1');
  });

  it('returns the same id on subsequent calls', () => {
    const identity = new DeviceIdentity({ userAgent: 'iPhone', storage });
    const a = identity.getOrCreate();
    const b = identity.getOrCreate();
    expect(a.deviceId).toBe(b.deviceId);
    expect(a.deviceName).toBe(b.deviceName);
  });

  it('setName updates the persisted name and reuses the id', () => {
    const identity = new DeviceIdentity({ userAgent: 'iPhone', storage });
    const a = identity.getOrCreate();
    identity.setName('My Custom Phone');
    const b = identity.getOrCreate();
    expect(b.deviceId).toBe(a.deviceId);
    expect(b.deviceName).toBe('My Custom Phone');
  });

  it('uses injected idGenerator', () => {
    const identity = new DeviceIdentity({ userAgent: 'iPhone', storage, idGenerator: () => 'fixed-id' });
    const { deviceId } = identity.getOrCreate();
    expect(deviceId).toBe('fixed-id');
  });
});
