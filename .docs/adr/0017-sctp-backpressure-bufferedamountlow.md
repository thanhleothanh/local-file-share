# 17. SCTP Backpressure via `bufferedamountlow`

**Status**: Accepted
**Date**: 2026-06-01

## Context

ADR-0016 removed `maxRetransmits: 0` from the data channel, which made delivery reliable but did not address the sender's send-side pacing. The WebRTC data channel sits on top of an SCTP stream with a finite send buffer. When the sender pushes chunks faster than the network can drain them, the buffer fills. Once the buffer is full, the data channel closes — and per the WebRTC spec this is a **silent close**: the `onclose` event fires but no error is surfaced, so the sender keeps writing into a dead channel and the receiver's `assembleFile` never sees all the chunks.

This bit us in practice on large files: at ~2412 chunks (≈ 38 MB at 16 KB each) the channel silently closed mid-send, the sender's `reader.onload` loop kept going, and the receiver was left with a half-assembled file. Reliability (ADR-0016) and chunk-integrity (the count-driven assembly in ADR-0016) cannot save a channel that has been killed underneath them.

## Decision

Apply **explicit application-level backpressure** on the data channel using the spec-built `bufferedamountlow` event:

1. **Set `bufferedAmountLowThreshold`** on the `data` channel when it is created (the offerer side, in `setupDataChannels`). Threshold = `1024 * 1024` (1 MiB). The default of 0 would mean the event only fires when the buffer is fully drained, which starves throughput. 1 MiB keeps a small pipeline going while still preventing overflow.

2. **`sendDataMessage` becomes Promise-returning.** It still calls `channel.send(data)`, but then resolves only once the buffer has drained to the threshold (or immediately if it was already drained). If the channel is missing or not `open`, it resolves immediately (no-op).

3. **A 60-second safety timeout** guards the drain wait. A stalled channel (peer unresponsive, mid-hangup) cannot hang the sender forever; after 60 s the wait resolves and a warning is logged. Sending proceeds so the rest of the file at least gets a chance to complete.

4. **Callers `await` the Promise.** `chunkHandler.sendFile`'s `reader.onload` becomes `async` and awaits `sendDataMessage` between chunks. `handleChunkRequestNack` also awaits, so NACK-driven retransmits do not pile on top of an already-full buffer. This converts "fire-and-forget into the channel" into a paced producer–consumer model.

5. **The control channel is unchanged.** It carries small JSON messages, so its `bufferedAmount` is never anywhere near the threshold; backpressure on it would only add latency for no benefit.

## Consequences

**Positive:**

- The SCTP buffer can no longer overflow, so the silent-close mid-transfer is no longer reachable through normal operation.
- The sender naturally throttles to the receiver's drain rate — slow receivers cause the sender to slow down, fast ones run flat-out.
- The 60 s safety timeout bounds the worst case if the receiver hangs or the network path breaks mid-send.
- Backpressure composes with the reliability model from ADR-0016: dropped chunks are caught by NACK, channel overflow is caught by `bufferedamountlow`.
- No external libraries, no custom framing — the WebRTC spec already provides the primitive.

**Negative:**

- `sendDataMessage` is no longer fire-and-forget; every call site has to be async-aware. The chunk sender and NACK retransmitter are, and the only other `data`-channel sender in the app is the control channel (no backpressure).
- The 1 MiB threshold means up to 1 MiB of chunks can be "in flight" at any moment. For our worst case (500 MB file, 8 KB chunks) this is a 0.2 % overhead — negligible.
- If the receiver stalls for 60 s the safety timer resolves and the sender pushes the next chunk into a still-full buffer. In practice the SCTP layer will then either drain (best case) or close the channel (in which case `handleFileReceived`'s 30 s ack timer will catch it and mark the file FAILED).
- A truly pathological peer (never reads, never closes) still wedges the send after 60 s. Acceptable: the existing connection-idle timeout (ADR-0010) will eventually fire and clean up.

## Alternatives Considered

1. **Stream chunks one at a time with a tiny delay** (`setTimeout(0)` between sends). Simple, but throughput collapses on any latency. A 1 ms RTT LAN becomes a 1 ms-per-chunk cap, so a 500 MB file takes ~60 s even at gigabit speed. The `bufferedamountlow` approach keeps the link saturated.

2. **Use the channel's `bufferedAmount` in a polling loop.** Conceptually similar but creates a wake-up storm; the event-based model is what the spec is designed for.

3. **Hand-roll a credit-based sliding window** (TCP-style). Far more code; not warranted for a 1:1 LAN file transfer.

4. **Use a worker thread for chunking and let the channel buffer absorb the bursts.** Doesn't actually fix the overflow — it just moves the production rate even further ahead of the drain rate.

## Related Decisions

- Reliable data channels (ADR-0016) — backpressure complements reliability
- Binary Header Format (ADR-0010) — chunk header structure
- Chunk Size 16KB (ADR-0011) — chunk size
- File State Machine (ADR-0008) — `FAILED` transition when the ack timer fires
- No File Size Limit / Streaming (ADR-0002) — streaming architecture with per-chunk ACK keeps the sender cache bounded
