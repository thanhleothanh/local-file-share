import { start } from 'node:repl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { SignalingServer } from '../../packages/server/src/SignalingServer.js';

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}

function nextMessageOfType(ws: WebSocket, type: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`timed out waiting for message type ${type}`));
    }, timeoutMs);
    const onMsg = (data: WebSocket.RawData): void => {
      const msg = JSON.parse(data.toString('utf-8')) as { type: string };
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg);
      }
    };
    ws.on('message', onMsg);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 1000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('timed out waiting for message'));
    }, timeoutMs);
    const onMsg = (data: WebSocket.RawData): void => {
      clearTimeout(timer);
      ws.off('message', onMsg);
      try {
        resolve(JSON.parse(data.toString('utf-8')));
      } catch (err) {
        reject(err);
      }
    };
    ws.on('message', onMsg);
  });
}

function waitForDeviceListWith(
  ws: WebSocket,
  predicate: (devices: Array<{ deviceId: string }>) => boolean,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('timed out waiting for device-list'));
    }, 2000);
    const onMsg = (data: WebSocket.RawData): void => {
      const msg = JSON.parse(data.toString('utf-8')) as {
        type: string;
        data?: { devices: Array<{ deviceId: string }> };
      };
      if (msg.type === 'device-list' && msg.data && predicate(msg.data.devices)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg);
      }
    };
    ws.on('message', onMsg);
  });
}

describe('SignalingServer connect flow', () => {
  let server: SignalingServer;
  let port = 0;

  beforeEach(async () => {
    server = new SignalingServer();
    await server.listen(0, '127.0.0.1');
    const addr = server.getAddress();
    if (addr === null) throw new Error('no address');
    port = addr.port;
  });

  afterEach(async () => {
    await server.close();
  });

  it('request-connect to a free target forwards the request', async () => {
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'register', from: 'a', data: { name: 'A' }, timestamp: 0 });
    send(b, { type: 'register', from: 'b', data: { name: 'B' }, timestamp: 0 });
    await waitForDeviceListWith(a, (d) => d.length === 2);
    send(a, {
      type: 'connect-request',
      from: 'a',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'A' },
      timestamp: 0,
    });
    const msg = (await nextMessageOfType(b, 'connect-request')) as {
      type: string;
      from: string;
      to: string;
      data: { requesterName: string };
    };
    expect(msg.from).toBe('a');
    expect(msg.to).toBe('b');
    expect(msg.data.requesterName).toBe('A');
    a.close();
    b.close();
  });

  it('request-connect to a busy target returns connect-rejected', async () => {
    const a = await connect(port);
    const b = await connect(port);
    const c = await connect(port);
    send(a, { type: 'register', from: 'a', data: { name: 'A' }, timestamp: 0 });
    send(b, { type: 'register', from: 'b', data: { name: 'B' }, timestamp: 0 });
    send(c, { type: 'register', from: 'c', data: { name: 'C' }, timestamp: 0 });
    await waitForDeviceListWith(a, (d) => d.length === 3);
    send(a, {
      type: 'connect-request',
      from: 'a',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'A' },
      timestamp: 0,
    });
    await nextMessageOfType(b, 'connect-request');
    send(b, { type: 'accept-connect', from: 'b', to: 'a', data: { requesterDeviceId: 'a' }, timestamp: 0 });
    await waitForDeviceListWith(
      c,
      (d) =>
        d.length === 3 &&
        d.some((x) => x.deviceId === 'a' && (x as { connectedTo: string | null }).connectedTo === 'b'),
    );
    send(c, {
      type: 'connect-request',
      from: 'c',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'C' },
      timestamp: 0,
    });
    const reject = (await nextMessageOfType(c, 'connect-rejected')) as {
      type: string;
      data: { reason: string };
    };
    expect(reject.data.reason).toBe('busy');
    a.close();
    b.close();
    c.close();
  });

  it('accept-connect marks both busy and forwards to requester', async () => {
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'register', from: 'a', data: { name: 'A' }, timestamp: 0 });
    send(b, { type: 'register', from: 'b', data: { name: 'B' }, timestamp: 0 });
    await waitForDeviceListWith(a, (d) => d.length === 2);
    send(a, {
      type: 'connect-request',
      from: 'a',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'A' },
      timestamp: 0,
    });
    await nextMessageOfType(b, 'connect-request');
    send(b, { type: 'accept-connect', from: 'b', to: 'a', data: { requesterDeviceId: 'a' }, timestamp: 0 });
    const accepted = (await nextMessageOfType(a, 'connect-accepted')) as { type: string; from: string };
    expect(accepted.from).toBe('b');
    a.close();
    b.close();
  });

  it('reject-connect does not mark busy and forwards to requester', async () => {
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'register', from: 'a', data: { name: 'A' }, timestamp: 0 });
    send(b, { type: 'register', from: 'b', data: { name: 'B' }, timestamp: 0 });
    await waitForDeviceListWith(a, (d) => d.length === 2);
    send(a, {
      type: 'connect-request',
      from: 'a',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'A' },
      timestamp: 0,
    });
    await nextMessageOfType(b, 'connect-request');
    send(b, {
      type: 'reject-connect',
      from: 'b',
      to: 'a',
      data: { requesterDeviceId: 'a', reason: 'no' },
      timestamp: 0,
    });
    const reject = (await nextMessageOfType(a, 'connect-rejected')) as { type: string };
    expect(reject.type).toBe('connect-rejected');
    a.close();
    b.close();
  });

  it('disconnect clears busy on both sides', async () => {
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'register', from: 'a', data: { name: 'A' }, timestamp: 0 });
    send(b, { type: 'register', from: 'b', data: { name: 'B' }, timestamp: 0 });
    await waitForDeviceListWith(a, (d) => d.length === 2);
    send(a, {
      type: 'connect-request',
      from: 'a',
      to: 'b',
      data: { targetDeviceId: 'b', requesterName: 'A' },
      timestamp: 0,
    });
    await nextMessageOfType(b, 'connect-request');
    send(b, { type: 'accept-connect', from: 'b', to: 'a', data: { requesterDeviceId: 'a' }, timestamp: 0 });
    await nextMessageOfType(a, 'connect-accepted');
    send(a, { type: 'disconnect', from: 'a', data: { targetDeviceId: 'b' }, timestamp: 0 });
    await waitForDeviceListWith(
      b,
      (d) => d.length === 2 && d.every((x) => (x as { connectedTo: string | null }).connectedTo === null),
    );
    a.close();
    b.close();
  });
});
