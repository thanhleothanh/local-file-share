import type { AnySignalingMessage } from '@lfs/shared';
import { describe, expect, it, vi } from 'vitest';
import { DeviceRegistry } from '../../packages/server/src/DeviceRegistry';
import {
  type MessageHandler,
  type MessageHandlerContext,
  SignalingRouter,
} from '../../packages/server/src/SignalingRouter';

function makeCtx(registry: DeviceRegistry, broadcast = vi.fn()) {
  return { registry, broadcast };
}

describe('SignalingRouter', () => {
  it('dispatches a message to the handler matching its type', async () => {
    const router = new SignalingRouter(makeCtx(new DeviceRegistry()));
    const handle = vi.fn();
    const handler: MessageHandler = { type: 'ping', handle };
    router.register(handler);
    const message = { type: 'ping', from: 'a', timestamp: 1 } as AnySignalingMessage;
    await router.route({} as never, message);
    expect(handle).toHaveBeenCalledOnce();
  });

  it('does not throw for unknown types; logs a warning instead', async () => {
    const router = new SignalingRouter(makeCtx(new DeviceRegistry()));
    await expect(
      router.route({} as never, { type: 'offer', from: 'a', timestamp: 1 } as AnySignalingMessage),
    ).resolves.toBeUndefined();
    expect(router.has('offer')).toBe(false);
  });

  it('multiple handlers can be registered, one per type', async () => {
    const router = new SignalingRouter(makeCtx(new DeviceRegistry()));
    const ping = vi.fn();
    const pong = vi.fn();
    router.register({ type: 'ping', handle: ping });
    router.register({ type: 'pong', handle: pong });
    await router.route({} as never, { type: 'pong', from: 'a', timestamp: 1 } as AnySignalingMessage);
    expect(pong).toHaveBeenCalledOnce();
    expect(ping).not.toHaveBeenCalled();
  });

  it('passes the client, message, registry, and broadcast to the handler', async () => {
    const registry = new DeviceRegistry();
    const broadcast = vi.fn();
    const router = new SignalingRouter({ registry, broadcast });
    let received: MessageHandlerContext | null = null;
    router.register({
      type: 'register',
      handle: (ctx) => {
        received = ctx;
      },
    });
    const client = { readyState: 1 } as never;
    const message = { type: 'register', from: 'a', timestamp: 1 } as AnySignalingMessage;
    await router.route(client, message);
    expect(received?.client).toBe(client);
    expect(received?.message).toBe(message);
    expect(received?.registry).toBe(registry);
    expect(received?.broadcast).toBe(broadcast);
  });
});
