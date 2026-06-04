const LOCAL_FILE_SHARE_PREFIX = 'LocalFileShare';

export async function runCleanStateHook(
  options: { localStorage?: Storage; indexedDB?: IDBFactory } = {},
): Promise<void> {
  const storage = options.localStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const idb = options.indexedDB ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);

  if (storage !== undefined) {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith('lfs:') && key !== 'lfs:deviceName') {
        storage.removeItem(key);
      }
    }
  }

  if (idb !== undefined) {
    await wipeMatchingDatabases(idb, LOCAL_FILE_SHARE_PREFIX);
  }
}

async function wipeMatchingDatabases(idb: IDBFactory, prefix: string): Promise<void> {
  if (typeof idb.databases !== 'function') {
    return;
  }
  const databases = await idb.databases();
  const matches = databases.filter((d) => d.name?.startsWith(prefix));
  await Promise.all(
    matches.map(
      (d) =>
        new Promise<void>((resolve) => {
          const req = idb.deleteDatabase(d.name as string);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        }),
    ),
  );
}
