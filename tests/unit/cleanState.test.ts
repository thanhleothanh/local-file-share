import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCleanStateHook } from '../../packages/client/src/cleanState';

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

function makeFakeIdb() {
  const dbList: string[] = [];
  return {
    databases: vi.fn(async () => dbList.map((name) => ({ name }))),
    deleteDatabase: vi.fn((name: string) => {
      const i = dbList.indexOf(name);
      if (i >= 0) dbList.splice(i, 1);
      const req = {
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onblocked: null as null | (() => void),
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }),
    add: (name: string) => dbList.push(name),
  };
}

describe('runCleanStateHook', () => {
  let storage: MemoryStorage;
  let idb: ReturnType<typeof makeFakeIdb>;

  beforeEach(() => {
    storage = new MemoryStorage();
    idb = makeFakeIdb();
  });

  it('removes all lfs:* keys except lfs:deviceName', async () => {
    storage.setItem('lfs:deviceId', 'abc');
    storage.setItem('lfs:deviceName', 'My Device');
    storage.setItem('lfs:pendingFiles', '[1,2,3]');
    storage.setItem('other:key', 'keep');

    await runCleanStateHook({ localStorage: storage, indexedDB: idb as unknown as IDBFactory });

    expect(storage.getItem('lfs:deviceId')).toBeNull();
    expect(storage.getItem('lfs:pendingFiles')).toBeNull();
    expect(storage.getItem('lfs:deviceName')).toBe('My Device');
    expect(storage.getItem('other:key')).toBe('keep');
  });

  it('deletes IndexedDB databases whose name starts with LocalFileShare', async () => {
    idb.add('LocalFileShare-files');
    idb.add('LocalFileShare-meta');
    idb.add('UnrelatedDB');

    await runCleanStateHook({ localStorage: storage, indexedDB: idb as unknown as IDBFactory });

    const calls = idb.deleteDatabase.mock.calls.map((c) => c[0]);
    expect(calls).toContain('LocalFileShare-files');
    expect(calls).toContain('LocalFileShare-meta');
    expect(calls).not.toContain('UnrelatedDB');
  });

  it('is a no-op when storage is empty', async () => {
    await expect(
      runCleanStateHook({ localStorage: storage, indexedDB: idb as unknown as IDBFactory }),
    ).resolves.toBeUndefined();
  });
});
