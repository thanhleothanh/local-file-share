import { ConnectionState } from '@lfs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocketClient, WebSocketEvent } from '../../../packages/client/src/signaling/WebSocketClient';
import { ConnectionViewModel } from '../../../packages/client/src/ui/ConnectionViewModel';

class MockClient {
  private readonly listeners = new Map<WebSocketEvent, Set<(payload: unknown) => void>>();
  public readonly sent: unknown[] = [];
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
  send(message: unknown): boolean {
    this.sent.push(message);
    return true;
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

  it('requestConnect sends connect-request and transitions to CONNECTING', () => {
    client.emit('device-list-updated', [
      { deviceId: 'me', deviceName: 'Me', connectedTo: null, registeredAt: 1 },
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    const ok = vm.requestConnect('b');
    expect(ok).toBe(true);
    expect(client.sent[0]).toMatchObject({ type: 'connect-request', from: 'me', to: 'b' });
    expect(vm.getState().connectionState).toBe(ConnectionState.CONNECTING);
    expect(vm.getState().connectingToDeviceId).toBe('b');
  });

  it('connect-accepted transitions to CONNECTED', () => {
    client.emit('device-list-updated', [
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    vm.requestConnect('b');
    client.emit('connect-accepted', { from: 'b', data: { requesterDeviceId: 'me' } });
    expect(vm.getState().connectionState).toBe(ConnectionState.CONNECTED);
    expect(vm.getState().connectedDeviceId).toBe('b');
  });

  it('connect-rejected returns to IDLE', () => {
    client.emit('device-list-updated', [
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    vm.requestConnect('b');
    client.emit('connect-rejected', { from: 'b', data: { requesterDeviceId: 'me' } });
    expect(vm.getState().connectionState).toBe(ConnectionState.IDLE);
    expect(vm.getState().connectingToDeviceId).toBeNull();
  });

  it('incoming-connect-request populates incomingRequest', () => {
    client.emit('incoming-connect-request', {
      from: 'a',
      data: { requesterName: 'Alpha' },
    });
    expect(vm.getState().incomingRequest).toEqual({ fromDeviceId: 'a', fromDeviceName: 'Alpha' });
  });

  it('acceptIncoming sends accept-connect and transitions to CONNECTED', () => {
    client.emit('incoming-connect-request', { from: 'a', data: { requesterName: 'Alpha' } });
    const ok = vm.acceptIncoming();
    expect(ok).toBe(true);
    expect(client.sent[0]).toMatchObject({ type: 'accept-connect', from: 'me', to: 'a' });
    expect(vm.getState().connectionState).toBe(ConnectionState.CONNECTED);
    expect(vm.getState().connectedDeviceId).toBe('a');
  });

  it('rejectIncoming sends reject-connect and clears incomingRequest', () => {
    client.emit('incoming-connect-request', { from: 'a', data: { requesterName: 'Alpha' } });
    const ok = vm.rejectIncoming('busy');
    expect(ok).toBe(true);
    expect(client.sent[0]).toMatchObject({ type: 'reject-connect', from: 'me', to: 'a' });
    expect(vm.getState().incomingRequest).toBeNull();
  });

  it('cancelOutgoing sends disconnect and returns to IDLE', () => {
    client.emit('device-list-updated', [
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    vm.requestConnect('b');
    const ok = vm.cancelOutgoing();
    expect(ok).toBe(true);
    expect(client.sent.some((s) => (s as { type: string }).type === 'disconnect')).toBe(true);
    expect(vm.getState().connectionState).toBe(ConnectionState.IDLE);
  });

  it('disconnect sends disconnect and returns to IDLE', () => {
    client.emit('device-list-updated', [
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    vm.requestConnect('b');
    client.emit('connect-accepted', { from: 'b', data: { requesterDeviceId: 'me' } });
    const ok = vm.disconnect();
    expect(ok).toBe(true);
    expect(vm.getState().connectionState).toBe(ConnectionState.IDLE);
    expect(vm.getState().connectedDeviceId).toBeNull();
  });

  it('peer-disconnected from server returns to IDLE', () => {
    client.emit('device-list-updated', [
      { deviceId: 'b', deviceName: 'B', connectedTo: null, registeredAt: 2 },
    ]);
    vm.requestConnect('b');
    client.emit('connect-accepted', { from: 'b', data: { requesterDeviceId: 'me' } });
    client.emit('peer-disconnected', { from: 'b' });
    expect(vm.getState().connectionState).toBe(ConnectionState.IDLE);
    expect(vm.getState().connectedDeviceId).toBeNull();
  });
});
