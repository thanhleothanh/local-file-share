import { ConnectionState } from '@lfs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocketClient, WebSocketEvent } from '../../../packages/client/src/signaling/WebSocketClient';
import { ConnectionViewModel } from '../../../packages/client/src/ui/ConnectionViewModel';

class MockClient {
  private readonly listeners = new Map<WebSocketEvent, Set<(payload: unknown) => void>>();
  on(event: WebSocketEvent, handler: (payload: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }
  emit(event: WebSocketEvent, payload: unknown): void {
    for (const h of this.listeners.get(event) ?? []) h(payload);
  }
}

function asClient(mock: MockClient): WebSocketClient {
  return mock as unknown as WebSocketClient;
}

describe('ConnectionViewModel', () => {
  let client: MockClient;
  let vm: ConnectionViewModel;

  beforeEach(() => {
    client = new MockClient();
    vm = new ConnectionViewModel({
      client: asClient(client),
      localDeviceId: 'me',
      localDeviceName: 'Me',
    });
    vm.attach();
  });

  it('exposes initial state with empty devices and IDLE connection', () => {
    const state = vm.getState();
    expect(state.devices).toEqual([]);
    expect(state.serverConnected).toBe(false);
    expect(state.connectionState).toBe(ConnectionState.IDLE);
    expect(state.localDeviceId).toBe('me');
  });

  it('updates devices on device-list-updated event', () => {
    client.emit('device-list-updated', [
      { deviceId: 'a', deviceName: 'Alpha', connectedTo: null, registeredAt: 1 },
    ]);
    expect(vm.getState().devices).toHaveLength(1);
  });

  it('sets serverConnected=true on registered event', () => {
    client.emit('registered', { deviceId: 'me', deviceName: 'Me' });
    expect(vm.getState().serverConnected).toBe(true);
  });

  it('sets serverConnected=false on close event', () => {
    client.emit('registered', {});
    client.emit('close', undefined);
    expect(vm.getState().serverConnected).toBe(false);
  });

  it('subscribers are notified on every update', () => {
    const listener = vi.fn();
    vm.subscribe(listener);
    client.emit('device-list-updated', [
      { deviceId: 'a', deviceName: 'A', connectedTo: null, registeredAt: 1 },
    ]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('detach unsubscribes from all client events', () => {
    const listener = vi.fn();
    vm.subscribe(listener);
    vm.detach();
    client.emit('device-list-updated', [
      { deviceId: 'a', deviceName: 'A', connectedTo: null, registeredAt: 1 },
    ]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('isSelf returns true only for the local deviceId', () => {
    expect(vm.isSelf({ deviceId: 'me', deviceName: 'Me', connectedTo: null, registeredAt: 1 })).toBe(true);
    expect(vm.isSelf({ deviceId: 'other', deviceName: 'Other', connectedTo: null, registeredAt: 1 })).toBe(
      false,
    );
  });
});
