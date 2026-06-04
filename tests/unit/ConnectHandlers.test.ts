import { describe, expect, it, vi } from 'vitest';
import {
  AcceptConnectHandler,
  ConnectRequestHandler,
  DisconnectHandler,
  RejectConnectHandler,
} from '../../packages/server/src/ConnectHandlers.js';
import type { Device, DeviceRegistry } from '../../packages/server/src/DeviceRegistry.js';
import type { MessageHandlerContext } from '../../packages/server/src/SignalingRouter.js';

function makeClient(): { send: ReturnType<typeof vi.fn>; readyState: number } {
  return { send: vi.fn(), readyState: 1 };
}

function makeDevice(over: Partial<Device> = {}): Device {
  return {
    deviceId: 'a',
    deviceName: 'A',
    socket: makeClient() as unknown as Device['socket'],
    connectedTo: null,
    registeredAt: 1,
    ...over,
  };
}

function makeRegistry(devices: Device[]): DeviceRegistry {
  const map = new Map<string, Device>();
  for (const d of devices) map.set(d.deviceId, d);
  return {
    getById: (id) => map.get(id) ?? null,
    isBusy: (id) => {
      const d = map.get(id);
      return d !== undefined && d.connectedTo !== null;
    },
    setConnection: (a, b) => {
      const aDev = map.get(a);
      if (aDev) aDev.connectedTo = b;
      if (b !== null) {
        const bDev = map.get(b);
        if (bDev) bDev.connectedTo = a;
      } else {
        for (const d of map.values()) {
          if (d.connectedTo === a) d.connectedTo = null;
        }
      }
    },
  } as unknown as DeviceRegistry;
}

function ctx(args: {
  client: { send: ReturnType<typeof vi.fn> };
  message: unknown;
  registry: DeviceRegistry;
  broadcast?: ReturnType<typeof vi.fn>;
}): MessageHandlerContext {
  return {
    client: args.client as unknown as MessageHandlerContext['client'],
    message: args.message as MessageHandlerContext['message'],
    registry: args.registry,
    broadcast: (args.broadcast ?? vi.fn()) as unknown as MessageHandlerContext['broadcast'],
  };
}

describe('ConnectRequestHandler', () => {
  it('forwards request to a free target', () => {
    const target = makeDevice({ deviceId: 'b' });
    const registry = makeRegistry([makeDevice({ deviceId: 'a' }), target]);
    const requester = makeClient();
    const handler = new ConnectRequestHandler();
    handler.handle(
      ctx({
        client: requester,
        registry,
        message: {
          type: 'connect-request',
          from: 'a',
          to: 'b',
          data: { targetDeviceId: 'b', requesterName: 'A' },
          timestamp: 0,
        },
      }),
    );
    const targetSocket = target.socket as unknown as { send: ReturnType<typeof vi.fn> };
    expect(targetSocket.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(targetSocket.send.mock.calls[0][0] as string);
    expect(payload.type).toBe('connect-request');
    expect(payload.from).toBe('a');
    expect(requester.send).not.toHaveBeenCalled();
  });

  it('rejects request when target is busy', () => {
    const target = makeDevice({ deviceId: 'b', connectedTo: 'c' });
    const registry = makeRegistry([makeDevice({ deviceId: 'a' }), target, makeDevice({ deviceId: 'c' })]);
    const requester = makeClient();
    const handler = new ConnectRequestHandler();
    handler.handle(
      ctx({
        client: requester,
        registry,
        message: {
          type: 'connect-request',
          from: 'a',
          to: 'b',
          data: { targetDeviceId: 'b', requesterName: 'A' },
          timestamp: 0,
        },
      }),
    );
    expect(requester.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(requester.send.mock.calls[0][0] as string);
    expect(payload.type).toBe('connect-rejected');
    expect(payload.data.reason).toBe('busy');
  });

  it('ignores request with missing target', () => {
    const registry = makeRegistry([makeDevice({ deviceId: 'a' })]);
    const requester = makeClient();
    const handler = new ConnectRequestHandler();
    handler.handle(
      ctx({
        client: requester,
        registry,
        message: {
          type: 'connect-request',
          from: 'a',
          data: { targetDeviceId: 'b' },
          timestamp: 0,
        },
      }),
    );
    expect(requester.send).not.toHaveBeenCalled();
  });
});

describe('AcceptConnectHandler', () => {
  it('marks both sides connected and forwards to requester', () => {
    const requester = makeDevice({ deviceId: 'a' });
    const target = makeDevice({ deviceId: 'b' });
    const registry = makeRegistry([requester, target]);
    const handler = new AcceptConnectHandler();
    const acceptorClient = target.socket as unknown as { send: ReturnType<typeof vi.fn> };
    handler.handle(
      ctx({
        client: acceptorClient as unknown as { send: ReturnType<typeof vi.fn> },
        registry,
        message: {
          type: 'accept-connect',
          from: 'b',
          to: 'a',
          data: { requesterDeviceId: 'a' },
          timestamp: 0,
        },
      }),
    );
    expect(requester.connectedTo).toBe('b');
    expect(target.connectedTo).toBe('a');
    const reqSocket = requester.socket as unknown as { send: ReturnType<typeof vi.fn> };
    expect(reqSocket.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(reqSocket.send.mock.calls[0][0] as string);
    expect(payload.type).toBe('connect-accepted');
    expect(payload.from).toBe('b');
  });
});

describe('RejectConnectHandler', () => {
  it('does not mark busy and forwards reject to requester', () => {
    const requester = makeDevice({ deviceId: 'a' });
    const target = makeDevice({ deviceId: 'b' });
    const registry = makeRegistry([requester, target]);
    const handler = new RejectConnectHandler();
    const targetClient = target.socket as unknown as { send: ReturnType<typeof vi.fn> };
    handler.handle(
      ctx({
        client: targetClient as unknown as { send: ReturnType<typeof vi.fn> },
        registry,
        message: {
          type: 'reject-connect',
          from: 'b',
          to: 'a',
          data: { requesterDeviceId: 'a', reason: 'no' },
          timestamp: 0,
        },
      }),
    );
    expect(requester.connectedTo).toBeNull();
    expect(target.connectedTo).toBeNull();
    const reqSocket = requester.socket as unknown as { send: ReturnType<typeof vi.fn> };
    expect(reqSocket.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(reqSocket.send.mock.calls[0][0] as string);
    expect(payload.type).toBe('connect-rejected');
  });
});

describe('DisconnectHandler', () => {
  it('clears connectedTo on both sides and notifies peer', () => {
    const a = makeDevice({ deviceId: 'a', connectedTo: 'b' });
    const b = makeDevice({ deviceId: 'b', connectedTo: 'a' });
    const registry = makeRegistry([a, b]);
    const handler = new DisconnectHandler();
    const aClient = a.socket as unknown as { send: ReturnType<typeof vi.fn> };
    handler.handle(
      ctx({
        client: aClient as unknown as { send: ReturnType<typeof vi.fn> },
        registry,
        message: {
          type: 'disconnect',
          from: 'a',
          data: { targetDeviceId: 'b', reason: 'user' },
          timestamp: 0,
        },
      }),
    );
    expect(a.connectedTo).toBeNull();
    expect(b.connectedTo).toBeNull();
    const bSocket = b.socket as unknown as { send: ReturnType<typeof vi.fn> };
    expect(bSocket.send).toHaveBeenCalledTimes(1);
  });
});
