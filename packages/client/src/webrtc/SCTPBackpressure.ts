/**
 * SCTP Backpressure implementation for WebRTC data channels.
 *
 * Uses the `bufferedamountlow` event to pace sends and prevent buffer overflow.
 * The data channel buffer is finite; when it fills, the channel silently closes.
 * This wrapper ensures sends are paced to the drain rate.
 */

const THRESHOLD = 1024 * 1024; // 1 MiB - keeps ~64 chunks in flight at 16 KB each
const SAFETY_TIMEOUT_MS = 60_000; // 60 seconds

// Type for a send method that returns a Promise
type AsyncSend = (data: string | ArrayBuffer | Blob) => Promise<void>;

// Extended type for wrapped channel
export interface WrappedDataChannel extends RTCDataChannel {
  send: AsyncSend;
}

/**
 * Wrap an RTCDataChannel with SCTP backpressure.
 * Returns the same channel object with a replaced `send` method that
 * returns a Promise<void> which resolves when the buffer drains.
 *
 * The wrapping is done in-place on the channel object.
 * The control channel should NOT be wrapped (its messages are tiny).
 */
function wrap(channel: RTCDataChannel): WrappedDataChannel {
  // Store original send before we replace it
  const originalSend = channel.send.bind(channel);
  const pending: Array<{ resolve: () => void; timeout: NodeJS.Timeout }> = [];

  const resolvePending = () => {
    const bufferedAmount = channel.bufferedAmount;
    while (pending.length > 0 && bufferedAmount <= THRESHOLD) {
      const item = pending.shift();
      if (item) {
        clearTimeout(item.timeout);
        item.resolve();
      }
    }
  };

  // Listen for bufferedamountlow events
  channel.addEventListener('bufferedamountlow', resolvePending);

  // Replace the send method with a Promise-returning version
  const asyncSend: AsyncSend = (data: string | ArrayBuffer | Blob) => {
    const bufferedAmount = channel.bufferedAmount;

    // If buffer is already drained, send immediately
    if (bufferedAmount <= THRESHOLD) {
      originalSend(data);
      return Promise.resolve();
    }

    // Otherwise, wait for buffer to drain
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        const index = pending.findIndex((p) => p.resolve === resolve);
        if (index !== -1) {
          pending.splice(index, 1);
          console.warn('[SCTPBackpressure] Safety timeout expired, proceeding without drain');
          resolve();
        }
      }, SAFETY_TIMEOUT_MS);

      pending.push({ resolve, timeout });
      originalSend(data);
    });
  };

  channel.send = asyncSend;

  return channel as WrappedDataChannel;
}

export const SCTPBackpressure = {
  wrap,
  THRESHOLD,
  SAFETY_TIMEOUT_MS,
};
