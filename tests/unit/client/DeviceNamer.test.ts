import { beforeEach, describe, expect, it } from 'vitest';
import {
  DeviceNamer,
  detectKind,
  getOrdinal,
  getStoredKind,
  setKind,
} from '../../../packages/client/src/identity/DeviceNamer';

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

describe('detectKind', () => {
  it('detects iPhone as mobile', () => {
    expect(detectKind('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe('mobile');
  });

  it('detects Android phone as mobile', () => {
    expect(detectKind('Mozilla/5.0 (Linux; Android 12; SM-G998B)')).toBe('mobile');
  });

  it('detects iPad as tablet', () => {
    expect(detectKind('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('tablet');
  });

  it('detects desktop Chrome as desktop', () => {
    expect(
      detectKind(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('desktop');
  });
});

describe('getOrdinal', () => {
  it('returns 1 on first call for a kind', () => {
    const s = new MemoryStorage();
    expect(getOrdinal('mobile', s)).toBe(1);
  });

  it('increments on subsequent calls', () => {
    const s = new MemoryStorage();
    getOrdinal('mobile', s);
    getOrdinal('mobile', s);
    expect(getOrdinal('mobile', s)).toBe(3);
  });

  it('tracks counters per kind independently', () => {
    const s = new MemoryStorage();
    getOrdinal('mobile', s);
    getOrdinal('mobile', s);
    expect(getOrdinal('desktop', s)).toBe(1);
  });
});

describe('DeviceNamer', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('generates "Mobile #1" on first call for mobile UA', () => {
    const namer = new DeviceNamer({ userAgent: 'iPhone', storage });
    expect(namer.generate().name).toBe('Mobile #1');
  });

  it('generates "Desktop #1" on first call for desktop UA', () => {
    const namer = new DeviceNamer({ userAgent: 'Chrome Linux', storage });
    expect(namer.generate().name).toBe('Desktop #1');
  });

  it('returns stored kind if previously set', () => {
    setKind('desktop', storage);
    const namer = new DeviceNamer({ userAgent: 'iPhone', storage });
    expect(namer.generate().name).toBe('Desktop #1');
  });

  it('persists ordinal across instances', () => {
    const n1 = new DeviceNamer({ userAgent: 'iPhone', storage });
    expect(n1.generate().name).toBe('Mobile #1');
    const n2 = new DeviceNamer({ userAgent: 'iPhone', storage });
    expect(n2.generate().name).toBe('Mobile #2');
  });
});

describe('getStoredKind', () => {
  it('returns null when nothing stored', () => {
    const s = new MemoryStorage();
    expect(getStoredKind(s)).toBeNull();
  });

  it('returns stored value', () => {
    const s = new MemoryStorage();
    setKind('tablet', s);
    expect(getStoredKind(s)).toBe('tablet');
  });
});
