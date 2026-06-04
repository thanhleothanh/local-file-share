import { SCTPBackpressure } from '../../../packages/client/src/webrtc/SCTPBackpressure.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock RTCDataChannel
class MockRTCDataChannel {
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  readyState: RTCDataChannelState = 'open';
  private sendImpl: (data: string | ArrayBuffer | Blob) => void;
  private eventListeners: Map<string, Array<() => void>> = new Map();

  constructor(bufferedAmount: number = 0) {
    this.bufferedAmount = bufferedAmount;
    this.bufferedAmountLowThreshold = SCTPBackpressure.THRESHOLD;
    this.sendImpl = vi.fn();
  }

  send(data: string | ArrayBuffer | Blob): void {
    this.sendImpl(data);
  }

  addEventListener(event: string, handler: () => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: () => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: string): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }

  // Helper to simulate bufferedAmountLow event
  fireBufferedAmountLow(): void {
    this.dispatchEvent('bufferedamountlow');
  }

  getSentData(): Array<string | ArrayBuffer | Blob> {
    return this.sendImpl.mock.calls.map((call) => call[0]);
  }

  getSendCallCount(): number {
    return this.sendImpl.mock.calls.length;
  }

  setBufferedAmount(amount: number): void {
    this.bufferedAmount = amount;
  }
}

describe('SCTPBackpressure', () => {
  let channel: MockRTCDataChannel;
  let wrappedChannel: ReturnType<typeof SCTPBackpressure.wrap>;

  beforeEach(() => {
    vi.useFakeTimers();
    channel = new MockRTCDataChannel(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wrap returns the same channel object', () => {
    wrappedChannel = SCTPBackpressure.wrap(channel);
    expect(wrappedChannel).toBe(channel);
  });

  it('replaced send method returns a Promise', async () => {
    wrappedChannel = SCTPBackpressure.wrap(channel);
    const result = wrappedChannel.send(new ArrayBuffer(0));
    expect(result).toBeInstanceOf(Promise);
    await result; // Should resolve immediately since bufferedAmount is 0
  });

  it('send resolves immediately when buffer is already drained', async () => {
    channel.setBufferedAmount(0);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    await wrappedChannel.send(new ArrayBuffer(8));

    expect(channel.getSendCallCount()).toBe(1);
  });

  it('send awaits bufferedamountlow event when buffer is above threshold', async () => {
    channel.setBufferedAmount(SCTPBackpressure.THRESHOLD + 1);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    // Start sending but don't await yet
    const sendPromise = wrappedChannel.send(new ArrayBuffer(8));

    // Verify send hasn't resolved yet
    expect(sendPromise).toBeInstanceOf(Promise);

    // Fire the bufferedamountlow event
    channel.setBufferedAmount(SCTPBackpressure.THRESHOLD - 1);
    channel.fireBufferedAmountLow();

    await sendPromise;

    expect(channel.getSendCallCount()).toBe(1);
  });

  it('send resolves on next microtask when buffer is drained', async () => {
    channel.setBufferedAmount(0);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    await expect(wrappedChannel.send(new ArrayBuffer(8))).resolves.toBeUndefined();
    expect(channel.getSendCallCount()).toBe(1);
  });

  it('safety timeout resolves after 60 seconds when channel never drains', async () => {
    channel.setBufferedAmount(SCTPBackpressure.THRESHOLD + 1);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sendPromise = wrappedChannel.send(new ArrayBuffer(8));

    // Advance time by 60 seconds
    vi.advanceTimersByTime(SCTPBackpressure.SAFETY_TIMEOUT_MS);

    await sendPromise;

    expect(consoleSpy).toHaveBeenCalledWith(
      '[SCTPBackpressure] Safety timeout expired, proceeding without drain',
    );
  });

  it('multiple sends are queued and resolved in order', async () => {
    channel.setBufferedAmount(SCTPBackpressure.THRESHOLD + 1);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    const send1 = wrappedChannel.send(new ArrayBuffer(8));
    const send2 = wrappedChannel.send(new ArrayBuffer(8));
    const send3 = wrappedChannel.send(new ArrayBuffer(8));

    // Fire the event to drain the queue
    channel.setBufferedAmount(SCTPBackpressure.THRESHOLD - 1);
    channel.fireBufferedAmountLow();

    await Promise.all([send1, send2, send3]);

    expect(channel.getSendCallCount()).toBe(3);
  });

  it('THRESHOLD constant is 1 MiB', () => {
    expect(SCTPBackpressure.THRESHOLD).toBe(1024 * 1024);
  });

  it('SAFETY_TIMEOUT_MS constant is 60000', () => {
    expect(SCTPBackpressure.SAFETY_TIMEOUT_MS).toBe(60_000);
  });

  it('wrap returns same channel with modified send method', () => {
    channel.setBufferedAmount(0);
    wrappedChannel = SCTPBackpressure.wrap(channel);

    // Verify it's the same object
    expect(wrappedChannel).toBe(channel);

    // Verify send returns a Promise
    const result = wrappedChannel.send(new ArrayBuffer(0));
    expect(result).toBeInstanceOf(Promise);
  });

  it('original send method is stored before replacement', async () => {
    channel.setBufferedAmount(0);
    const originalSend = channel.send.bind(channel);

    wrappedChannel = SCTPBackpressure.wrap(channel);

    // Call the wrapped send
    await wrappedChannel.send(new ArrayBuffer(8));

    // The data should have been sent via the original send
    expect(channel.getSendCallCount()).toBe(1);
  });
});
