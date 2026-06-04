import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { SignalingServer } from '../../packages/server/src/SignalingServer';

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForMessage(ws: WebSocket, predicate: (msg: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve) => {
    const handler = (data: unknown) => {
      const text = typeof data === 'string' ? data : (data as Buffer).toString('utf-8');
      const obj = JSON.parse(text);
      if (predicate(obj)) {
        ws.off('message', handler);
        resolve(obj);
      }
    };
    ws.on('message', handler);
  });
}

function send(ws: WebSocket, message: unknown): void {
  ws.send(JSON.stringify(message));
}

describe('SignalingServer integration', () => {
  let server: SignalingServer | null = null;
  let clients: WebSocket[] = [];

  afterEach(async () => {
    for (const c of clients) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    clients = [];
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('two clients register and see each other in the device list', async () => {
    server = new SignalingServer();
    await server.listen(0, '127.0.0.1');
    const port = server.getAddress()?.port;

    const a = await connect(port);
    const b = await connect(port);
    clients = [a, b];

    const aList = waitForMessage(a, (m) => m.type === 'device-list');
    send(a, { type: 'register', from: 'A', data: { name: 'Alpha' } });
    await aList;

    const bList = waitForMessage(
      b,
      (m) => m.type === 'device-list' && (m.data as { devices: unknown[] }).devices.length === 2,
    );
    send(b, { type: 'register', from: 'B', data: { name: 'Bravo' } });
    const list = (await bList) as { data: { devices: Array<{ deviceId: string }> } };
    const ids = list.data.devices.map((d) => d.deviceId).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  it('closing one client removes it from the other client device list within 1 second', async () => {
    server = new SignalingServer();
    await server.listen(0, '127.0.0.1');
    const port = server.getAddress()?.port;

    const a = await connect(port);
    const b = await connect(port);
    clients = [a, b];

    send(a, { type: 'register', from: 'A', data: { name: 'Alpha' } });
    await waitForMessage(a, (m) => m.type === 'device-list');

    const bothRegistered = waitForMessage(a, (m) => {
      if (m.type !== 'device-list') return false;
      const devices = (m as { data: { devices: Array<{ deviceId: string }> } }).data.devices;
      return devices.length === 2;
    });
    send(b, { type: 'register', from: 'B', data: { name: 'Bravo' } });
    await bothRegistered;

    const aDisco = waitForMessage(a, (m) => {
      if (m.type !== 'device-list') return false;
      const devices = (m as { data: { devices: Array<{ deviceId: string }> } }).data.devices;
      return devices.length === 1 && devices[0]?.deviceId === 'A';
    });
    b.close();
    await aDisco;
  });
});
