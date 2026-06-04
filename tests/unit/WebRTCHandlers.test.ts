import { OfferHandler, AnswerHandler, IceCandidateHandler } from '../../packages/server/src/WebRTCHandlers.js';
import { Logger } from '@lfs/shared';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

class MockSocket implements Partial<WebSocket> {
  readonly sent: unknown[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
}

class MockDevice {
  readonly socket: MockSocket;
  readonly deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.socket = new MockSocket();
  }
}

class MockRegistry {
  private devices = new Map<string, MockDevice>();

  getById(id: string): MockDevice | null {
    return this.devices.get(id) ?? null;
  }

  addDevice(device: MockDevice): void {
    this.devices.set(device.deviceId, device);
  }
}

function createMockContext() {
  const client = new MockSocket();
  const target = new MockDevice('target-device');
  const registry = new MockRegistry();
  registry.addDevice(new MockDevice('source-device'));
  registry.addDevice(target);

  const broadcast = vi.fn();

  return {
    client,
    target,
    registry,
    broadcast,
    message: {
      type: 'offer' as const,
      from: 'source-device',
      to: 'target-device',
      data: { sdp: 'sdp-string', type: 'offer' },
      timestamp: Date.now(),
    },
  };
}

describe('WebRTCHandlers', () => {
  describe('OfferHandler', () => {
    it('forwards offer to target device', () => {
      const logger = new Logger('OfferHandler');
      const handler = new OfferHandler(logger);
      const ctx = createMockContext();

      handler.handle({
        client: ctx.client,
        message: ctx.message,
        registry: ctx.registry,
        broadcast: ctx.broadcast,
      });

      // The target should have received the offer
      expect(ctx.target.socket.sent).toHaveLength(1);
      const sent = JSON.parse(ctx.target.socket.sent[0] as string);
      expect(sent.type).toBe('offer');
      expect(sent.from).toBe('source-device');
      expect(sent.to).toBe('target-device');
      expect(sent.data.sdp).toBe('sdp-string');
    });

    it('does not forward offer when target not found', () => {
      const logger = new Logger('OfferHandler');
      const handler = new OfferHandler(logger);
      const ctx = createMockContext();
      ctx.message.to = 'non-existent-device';

      handler.handle({
        client: ctx.client,
        message: ctx.message,
        registry: ctx.registry,
        broadcast: ctx.broadcast,
      });

      expect(ctx.target.socket.sent).toHaveLength(0);
    });
  });

  describe('AnswerHandler', () => {
    it('forwards answer to requester device', () => {
      const logger = new Logger('AnswerHandler');
      const handler = new AnswerHandler(logger);
      const ctx = createMockContext();
      ctx.message.type = 'answer';
      ctx.message.data.type = 'answer';

      handler.handle({
        client: ctx.client,
        message: ctx.message,
        registry: ctx.registry,
        broadcast: ctx.broadcast,
      });

      expect(ctx.target.socket.sent).toHaveLength(1);
      const sent = JSON.parse(ctx.target.socket.sent[0] as string);
      expect(sent.type).toBe('answer');
      expect(sent.from).toBe('source-device');
      expect(sent.to).toBe('target-device');
    });
  });

  describe('IceCandidateHandler', () => {
    it('forwards ice candidate to target device', () => {
      const logger = new Logger('IceCandidateHandler');
      const handler = new IceCandidateHandler(logger);
      const ctx = createMockContext();
      ctx.message.type = 'ice-candidate';
      ctx.message.data = {
        candidate: 'candidate-string',
        sdpMid: 'mid',
        sdpMLineIndex: 0,
      };

      handler.handle({
        client: ctx.client,
        message: ctx.message,
        registry: ctx.registry,
        broadcast: ctx.broadcast,
      });

      expect(ctx.target.socket.sent).toHaveLength(1);
      const sent = JSON.parse(ctx.target.socket.sent[0] as string);
      expect(sent.type).toBe('ice-candidate');
      expect(sent.from).toBe('source-device');
      expect(sent.to).toBe('target-device');
      expect(sent.data.candidate).toBe('candidate-string');
    });
  });
});
