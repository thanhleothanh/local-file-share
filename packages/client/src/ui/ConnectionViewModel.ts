import type { DeviceDescriptor } from '@lfs/shared';
import { ConnectionState } from '@lfs/shared';
import type { WebSocketClient } from '../signaling/WebSocketClient.js';

export interface ConnectionViewModelState {
  devices: readonly DeviceDescriptor[];
  serverConnected: boolean;
  connectionState: ConnectionState;
  connectedDeviceId: string | null;
  connectingToDeviceId: string | null;
  localDeviceId: string;
  localDeviceName: string;
}

export interface ConnectionViewModelOptions {
  client: WebSocketClient;
  localDeviceId: string;
  localDeviceName: string;
}

export type ConnectionViewModelListener = (state: ConnectionViewModelState) => void;

export class ConnectionViewModel {
  private readonly client: WebSocketClient;
  private state: ConnectionViewModelState;
  private readonly listeners = new Set<ConnectionViewModelListener>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(options: ConnectionViewModelOptions) {
    this.client = options.client;
    this.state = {
      devices: [],
      serverConnected: false,
      connectionState: ConnectionState.IDLE,
      connectedDeviceId: null,
      connectingToDeviceId: null,
      localDeviceId: options.localDeviceId,
      localDeviceName: options.localDeviceName,
    };
  }

  getState(): ConnectionViewModelState {
    return this.state;
  }

  subscribe(listener: ConnectionViewModelListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  attach(): void {
    this.unsubscribers.push(
      this.client.on('device-list-updated', (devices) => {
        this.update((prev) => ({ ...prev, devices: devices as readonly DeviceDescriptor[] }));
      }),
      this.client.on('registered', () => {
        this.update((prev) => ({ ...prev, serverConnected: true }));
      }),
      this.client.on('close', () => {
        this.update((prev) => ({ ...prev, serverConnected: false }));
      }),
    );
  }

  detach(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  isSelf(device: DeviceDescriptor): boolean {
    return device.deviceId === this.state.localDeviceId;
  }

  private update(updater: (prev: ConnectionViewModelState) => ConnectionViewModelState): void {
    this.state = updater(this.state);
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* swallow */
      }
    }
  }
}
