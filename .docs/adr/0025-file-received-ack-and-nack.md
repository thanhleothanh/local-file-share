# 25. FILE_RECEIVED Acknowledgement and NACK-Based Retransmit

**Status**: Accepted
**Date**: 2026-06-01

## Context

The original transfer protocol had two race-condition bugs that surfaced when sending multi-chunk files over the WebRTC data channel:

1. **Silent data loss.** Both data channels were created with `maxRetransmits: 0`, which the WebRTC spec treats as "unreliable mode" — chunks could be silently dropped, corrupting reassembled files. The receiver's UI would stick at e.g. 98% with a downloaded file that had missing lines.

2. **Premature completion.** The sender marked its local file `COMPLETED` the instant it queued the last chunk (and sent `TRANSFER_DONE`), while the receiver transitioned to `COMPLETED` on receipt of the `isLast=1` chunk — which could arrive before all earlier chunks under reordering. The two UIs drifted out of sync and the sender was notified of "completion" before the receiver had actually finished assembling.

## Decision

Adopt a two-part fix:

### 1. Reliable data channels

Drop `maxRetransmits: 0` from both the `control` and `data` channels in `setupDataChannels`. The default mode is reliable + ordered, which is what file transfer needs.

### 2. Explicit receiver→sender acknowledgement

Replace the implicit "sender is done, receiver is done" handshake with an explicit one:

```
Sender                                          Receiver
  |  FILE_OFFER   (control)                        |
  |------------------------------------------------>|
  |  FILE_ACCEPT  (control)                        |
  |<------------------------------------------------|
  |  chunk 0..N-1 (data)                           |
  |================================================>|
  |  TRANSFER_DONE  (control)                      |
  |------------------------------------------------>|
  |                            (assemble + verify)  |
  |  FILE_RECEIVED  (control)                      |
  |<------------------------------------------------|
  |  file → COMPLETED locally                      |
  |  advance send queue                            |
```

The receiver only assembles once `Math.ceil(file.size / CHUNK_SIZE)` distinct indices have arrived. The `isLast` chunk is used as a "sender is done queueing" signal to trigger a missing-chunk check / NACK — never to time assembly.

### 3. NACK-based retransmit (defense in depth)

If the receiver's integrity check detects missing chunks (either when the count is short of expected, or when the `isLast` chunk arrives early), it sends `CHUNK_REQUEST_NACK { fileId, missingIndices: number[] }`. The sender keeps an in-memory `sentChunkCache: Map<fileId, Map<index, ArrayBuffer>>` for the lifetime of the file, re-sends the requested chunks, and resets its `FILE_RECEIVED` ack timer. After `MAX_NACK_ROUNDS = 3` rounds the receiver gives up and marks the file `FAILED`.

## Consequences

**Positive:**
- No more silently-dropped chunks — files are byte-for-byte complete.
- Sender and receiver UIs converge on `COMPLETED` at the same moment, because the sender's transition is gated on the receiver's explicit `FILE_RECEIVED` ack.
- The control channel is also reliable, so `FILE_OFFER` / `FILE_ACCEPT` / `TRANSFER_DONE` cannot be dropped mid-handshake.
- `handleTransferDone` is now queue-management only on the receiver side and a no-op on the sender's own file — the queue advance happens in `handleFileReceived`.
- Defensive NACK layer catches any future case where the data channel does drop a message (e.g., a misbehaving relay).

**Negative:**
- The sender's UI shows "Sending…" slightly longer than before, by exactly the network round-trip + assembly time. In practice this is sub-100ms on a LAN.
- In-memory chunk cache uses O(file size) of memory per active file. The 500MB file-size limit (ADR-0005) caps this. A failed/acknowledged file's cache is dropped immediately. This memory concern is addressed by per-chunk ACKs (ADR-0030), which enable the sender to delete cached chunks as soon as they are acknowledged by the receiver.
- 30s timeout on `FILE_RECEIVED` ack — if the receiver never responds (crash, network drop), the file is marked `FAILED` and the queue advances.

## Alternatives Considered

1. **Sender marks COMPLETED locally, then waits for receiver `FILE_RECEIVED` to "confirm"** — this gives the same UI sync but leaves a window where the file is "COMPLETED" on the sender and then "un-COMPLETED" if the NACK round fails. Worse UX than the current "stay in TRANSFERRING until confirmed" model.

2. **Implicit "all chunks received" detection via `TRANSFER_DONE` + small grace period** — fragile, requires tuning, doesn't actually fix the underlying drop bug.

3. **TCP-style sliding window with selective repeat** — far more complex, the bounded NACK approach is enough for a single-file-at-a-time P2P transfer.

## Related Decisions

- WebRTC Data Channels for Direct P2P Communication (ADR-0020) — channel reliability model
- Binary Header Format (ADR-0014) — chunk header structure
- Chunk Size 8KB (ADR-0015) — `CHUNK_SIZE` constant
- File State Machine (ADR-0011) — state transitions for `COMPLETED` and `FAILED`
- Two-QR Handshake (ADR-0003) — connection establishment
- Per-Chunk ACK for Cache Management (ADR-0030) — supersedes the O(file size) memory concern by enabling sender to delete cached chunks as soon as they are acknowledged by the receiver

**Status Note**: This ADR documents the foundational NACK-based reliability mechanism. The memory concern noted in the Negative Consequences section is addressed by ADR-0030, which introduces per-chunk ACK with batching to keep sender cache bounded.
