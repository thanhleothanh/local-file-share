import { generateUuid } from '@lfs/shared';
import { DeviceNamer, type DeviceNamerOptions } from './DeviceNamer.js';

const DEVICE_ID_KEY = 'lfs:deviceId';
const DEVICE_NAME_KEY = 'lfs:deviceName';

export interface DeviceIdentityOptions extends DeviceNamerOptions {
  storage?: Storage;
  idGenerator?: () => string;
}

export interface DeviceIdentityState {
  deviceId: string;
  deviceName: string;
}

export class DeviceIdentity {
  private readonly storage: Storage;
  private readonly idGenerator: () => string;
  private readonly namer: DeviceNamer;

  constructor(options: DeviceIdentityOptions = {}) {
    this.storage =
      options.storage ??
      (typeof localStorage !== 'undefined' ? localStorage : (undefined as unknown as Storage));
    this.idGenerator = options.idGenerator ?? generateUuid;
    this.namer = new DeviceNamer({
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      storage: this.storage,
    });
  }

  getOrCreate(): DeviceIdentityState {
    const storedId = this.storage.getItem(DEVICE_ID_KEY);
    const storedName = this.storage.getItem(DEVICE_NAME_KEY);
    if (storedId !== null && storedName !== null) {
      return { deviceId: storedId, deviceName: storedName };
    }
    const id = this.idGenerator();
    const name = storedName ?? this.namer.generate().name;
    this.storage.setItem(DEVICE_ID_KEY, id);
    this.storage.setItem(DEVICE_NAME_KEY, name);
    return { deviceId: id, deviceName: name };
  }

  setName(name: string): void {
    this.storage.setItem(DEVICE_NAME_KEY, name);
  }

  getId(): string | null {
    return this.storage.getItem(DEVICE_ID_KEY);
  }

  getName(): string | null {
    return this.storage.getItem(DEVICE_NAME_KEY);
  }
}
