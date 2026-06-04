import { IceExchange } from '../../../packages/client/src/webrtc/IceExchange.js';
import { Logger } from '@lfs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('IceExchange', () => {
  let iceExchange: IceExchange;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('IceExchange');
    iceExchange = new IceExchange({ logger: mockLogger });
  });

  it('onRemoteDescriptionSet sets flag and flushes buffer', () => {
    const handler = vi.fn();
    iceExchange.on('iceCandidate', handler);

    // Add candidates to buffer
    const candidate1 = { candidate: 'candidate-1', sdpMid: null, sdpMLineIndex: null };
    const candidate2 = { candidate: 'candidate-2', sdpMid: null, sdpMLineIndex: null };

    // Manually add to buffer (simulating messages received before remote description is set)
    (iceExchange as any).candidateBuffer = [candidate1, candidate2];
    (iceExchange as any).remoteDescriptionSet = false;

    iceExchange.onRemoteDescriptionSet();

    expect((iceExchange as any).remoteDescriptionSet).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(candidate1);
    expect(handler).toHaveBeenCalledWith(candidate2);
  });

  it('handleIncomingIceCandidate buffers candidates when remote description not set', () => {
    const handler = vi.fn();
    iceExchange.on('iceCandidate', handler);

    const message = {
      type: 'ice-candidate',
      from: 'device-a',
      to: 'device-b',
      data: {
        candidate: 'candidate-1',
        sdpMid: null,
        sdpMLineIndex: null,
      },
      timestamp: Date.now(),
    };

    // Before remote description is set
    iceExchange.handleIncomingIceCandidate(message);

    expect((iceExchange as any).candidateBuffer).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();

    // After remote description is set
    iceExchange.onRemoteDescriptionSet();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handleIncomingIceCandidate emits immediately when remote description is set', () => {
    const handler = vi.fn();
    iceExchange.on('iceCandidate', handler);

    iceExchange.onRemoteDescriptionSet(); // Set flag

    const message = {
      type: 'ice-candidate',
      from: 'device-a',
      to: 'device-b',
      data: {
        candidate: 'candidate-1',
        sdpMid: 'mid',
        sdpMLineIndex: 0,
      },
      timestamp: Date.now(),
    };

    iceExchange.handleIncomingIceCandidate(message);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      candidate: 'candidate-1',
      sdpMid: 'mid',
      sdpMLineIndex: 0,
    });
  });

  it('createIceCandidateMessage creates a properly formatted message', () => {
    const candidate = {
      candidate: 'candidate-string',
      sdpMid: 'mid',
      sdpMLineIndex: 0,
    };

    const message = iceExchange.createIceCandidateMessage(
      candidate as RTCIceCandidate,
      'target-device',
      'from-device',
    );

    expect(message.type).toBe('ice-candidate');
    expect(message.from).toBe('from-device');
    expect(message.to).toBe('target-device');
    expect(message.data).toEqual({
      candidate: 'candidate-string',
      sdpMid: 'mid',
      sdpMLineIndex: 0,
    });
    expect(typeof message.timestamp).toBe('number');
  });

  it('clear removes buffered candidates and resets flag', () => {
    (iceExchange as any).candidateBuffer = [
      { candidate: 'candidate-1', sdpMid: null, sdpMLineIndex: null },
    ];
    (iceExchange as any).remoteDescriptionSet = true;

    iceExchange.clear();

    expect((iceExchange as any).candidateBuffer).toEqual([]);
    expect((iceExchange as any).remoteDescriptionSet).toBe(false);
  });

  it('handleIncomingIceCandidate ignores messages without candidate data', () => {
    const handler = vi.fn();
    iceExchange.on('iceCandidate', handler);
    iceExchange.onRemoteDescriptionSet();

    const message = {
      type: 'ice-candidate',
      from: 'device-a',
      to: 'device-b',
      data: {},
      timestamp: Date.now(),
    };

    iceExchange.handleIncomingIceCandidate(message);
    expect(handler).not.toHaveBeenCalled();
  });
});
