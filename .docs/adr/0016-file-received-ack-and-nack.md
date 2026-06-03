# 16. FILE_RECEIVED Acknowledgement and NACK-Based Retransmit

**Status**: Accepted
**Date**: 2026-06-03

## Context

File transfer over WebRTC data channels requires two guarantees: (1) no silently-dropped chunks, and (2) sender and receiver UIs stay in sync. The original protocol had race-condition bugs — unreliable data channels could silently drop chunks, and premature completion markers caused UI drift.

Additionally, the original design cached all chunks in memory for the file's lifetime. With no file size limit (ADR-0002), this doesn't scale — a 5GB file would require 5GB of RAM just for the cache.

## Decision

Adopt a three-part mechanism:

### 1. Reliable data channels

Drop `maxRetransmits: 0` from both the `control` and `data` channels. The default mode is reliable + ordered, which is what file transfer needs.

### 2. Per-chunk ACK (cache management)

The receiver sends an **ACK for every chunk it receives** on the control channel:

```json
{ "type": "CHUNK_ACK", "fileId": "uuid", "index": 42 }
```

The sender maintains an in-memory `sentChunkCache: Map<fileId, Map<index, ArrayBuffer>>`. On each chunk send, the sender stores the chunk in the cache. When the ACK arrives, the sender deletes that chunk from the cache.

**Cache lifecycle:**
- **Write**: Sender sends chunk N → `cache.get(fileId).set(index, chunkData)`
- **Delete**: ACK arrives for chunk N → `cache.get(fileId).delete(index)`
- **Cleanup**: On file COMPLETED or FAILED → `cache.delete(fileId)`

**Concurrency**: JavaScript is single-threaded. The event loop processes one task at a time — sending chunks and handling ACKs never execute concurrently. The `await` in the chunk sender (SCTP backpressure, ADR-0017) yields to the event loop, allowing ACKs to be processed between sends. No locks or concurrent data structures needed.

**Memory bound**: The cache size is bounded by `throughput × RTT`. On a 1ms LAN, only a handful of chunks are in flight at any time. For a 5GB file at 16KB chunks, the cache typically holds ~10–100 chunks (160KB–1.6MB), not 5GB.

### 3. NACK-based retransmit (reliability)

After sending `TRANSFER_DONE`, the receiver performs an integrity check: `Math.ceil(file.size / CHUNK_SIZE)` distinct indices expected, minus what was received.

If chunks are missing, the receiver sends:

```json
{ "type": "CHUNK_REQUEST_NACK", "fileId": "uuid", "missingIndices": [3, 7, 42] }
```

The sender re-sends the requested chunks from `sentChunkCache`. These chunks are still in the cache because they were never ACKed (the receiver never received them).

After `MAX_NACK_ROUNDS = 3`, the receiver gives up and marks the file `FAILED`.

### 4. Explicit completion handshake

```
Sender                                          Receiver
  |  FILE_OFFER   (control)                        |
  |------------------------------------------------>|
  |  FILE_ACCEPT  (control)                        |
  |<------------------------------------------------|
  |  chunk 0..N-1 (data)                           |
  |  ← ACK per chunk (control) ←                   |
  |================================================>|
  |  TRANSFER_DONE  (control)                      |
  |------------------------------------------------>|
  |                  (integrity check)              |
  |  FILE_RECEIVED  (control)    ← if all good     |
  |  CHUNK_REQUEST_NACK          ← if missing       |
  |<------------------------------------------------|
  |  re-send missing from cache (up to 3 rounds)   |
  |================================================>|
  |  FILE_RECEIVED  (control)                      |
  |<------------------------------------------------|
  |  file → COMPLETED locally                      |
  |  advance send queue                            |
```

## Consequences

**Positive:**
- Cache size bounded by `throughput × RTT`, not file size — works for files of any length
- No head-of-line blocking — each chunk is ACKed independently
- Immediate eviction on ACK — memory freed as soon as receiver confirms
- NACK retransmission still works because unACKed chunks stay in cache
- Sender and receiver UIs converge on COMPLETED simultaneously
- Simple implementation: plain `Map` operations, no concurrent data structures needed

**Negative:**
- Per-chunk ACK adds ~50 bytes × number of chunks of control channel traffic (negligible: ~1.6MB for a 500MB file)
- 30s timeout on `FILE_RECEIVED` ack — if the receiver never responds, the file is marked `FAILED`
- Sender's UI shows "Sending…" until the final `FILE_RECEIVED` arrives (sub-100ms on LAN)

## Alternatives Considered

1. **Full file cache (original)**: Cache all chunks for the file's lifetime. Cons: Memory usage scales with file size — 5GB file needs 5GB RAM.
2. **Window-based ACK (e.g., every 50 chunks)**: ACK ranges instead of individual chunks. Cons: Head-of-line blocking — one lost chunk prevents all subsequent windows from being ACKed, cache grows unbounded.
3. **Timer-based ACK (e.g., every 5s)**: Receiver sends cumulative ACK on a timer. Cons: Cache grows during silent periods; timing is less predictable than per-chunk ACK.
4. **TCP-style sliding window**: Selective repeat with credit-based flow control. Cons: Far more complex, not warranted for 1:1 LAN transfer.
