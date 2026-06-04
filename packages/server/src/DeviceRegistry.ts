import { Logger } from '@lfs/shared';
import type { DeviceDescriptor } from '@lfs/shared';
import type { WebSocket } from 'ws';

export type DeviceSocket = WebSocket;

export interface Device {
  deviceId: string;
  deviceName: string;
  socket: DeviceSocket;
  connectedTo: string | null;
  registeredAt: number;
}

export type DeviceListener = (devices: readonly DeviceDescriptor[]) => void;

export class DeviceRegistry {
  private readonly devices = new Map<string, Device>();
  private readonly listeners = new Set<DeviceListener>();
  private readonly logger: Logger;

  constructor(module = 'DeviceRegistry') {
    this.logger = new Logger(module);
  }

  register(device: Device): void {
    this.devices.set(device.deviceId, device);
    this.logger.info('device registered', { deviceId: device.deviceId, deviceName: device.deviceName });
    this.emit();
  }

  unregister(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (device === undefined) {
      return false;
    }
    this.devices.delete(deviceId);
    for (const other of this.devices.values()) {
      if (other.connectedTo === deviceId) {
        other.connectedTo = null;
      }
    }
    this.logger.info('device unregistered', { deviceId });
    this.emit();
    return true;
  }

  getAll(): Device[] {
    return Array.from(this.devices.values());
  }

  getById(id: string): Device | null {
    return this.devices.get(id) ?? null;
  }

  setConnection(aId: string, bId: string | null): void {
    const a = this.devices.get(aId);
    if (a === undefined) {
      return;
    }
    a.connectedTo = bId;
    if (bId !== null) {
      const b = this.devices.get(bId);
      if (b !== undefined) {
        b.connectedTo = aId;
      }
    } else {
      for (const other of this.devices.values()) {
        if (other.connectedTo === aId) {
          other.connectedTo = null;
        }
      }
    }
    this.emit();
  }

  isBusy(id: string): boolean {
    const device = this.devices.get(id);
    return device?.connectedTo !== null && device?.connectedTo !== undefined;
  }

  onChange(listener: DeviceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toDescriptors(): DeviceDescriptor[] {
    return this.getAll().map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      connectedTo: d.connectedTo,
      registeredAt: d.registeredAt,
    }));
  }

  private emit(): void {
    const snapshot = this.toDescriptors();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
