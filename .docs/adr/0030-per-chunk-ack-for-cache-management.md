# 30. Per-Chunk ACK for Cache Management

**Status**: Accepted
**Date**: 2026-06-04
**Supersedes**: None

## Context

The current NACK-based retransmit mechanism (ADR-0025) caches all chunks for a file on the sender side until the receiver sends FILE_RECEIVED. For large files, this results in O(file size) memory usage per active transfer. With a 500MB file limit and potentially multiple concurrent transfers, the sender's memory footprint can become unacceptably large.

## Decision

Introduce per-chunk acknowledgement (ACK) messages to enable the sender to delete cached chunks as soon as they are confirmed received by the receiver. This keeps the in-memory cache bounded to only un-acknowledged chunks (roughly one RTT worth in steady state) rather than the entire file.

**Key design choices:**

- **Keep NACK as defense-in-depth**: NACK-based retransmit remains the primary reliability mechanism. ACKs are an optimization for cache management, not a replacement for NACK.
- **Batched ACKs**: Receiver batches chunk ACKs per file and sends them every 5 seconds to reduce control message overhead.
- **Header verification only**: Receiver verifies chunk header (fileId, index, isLast) before adding to the ACK batch. Content verification remains at file completion.
- **Flush on terminal states**: Receiver flushes pending ACKs immediately when a file reaches COMPLETED, FAILED, or CANCELLED state.
- **Idempotent sender handling**: Sender deletes ACKed chunks from cache on receipt. If a chunk is already deleted (duplicate ACK or NACK race condition), the operation is a no-op.

## Consequences

**Positive:**
- Sender cache memory usage drops from O(file size) to O(window size), where window ≈ chunks sent in 5 seconds.
- Scales to large files without proportional memory growth.
- Maintains existing reliability guarantees via NACK fallback.

**Negative:**
- Additional control message traffic (though batched).
- Sender cannot resend ACKed chunks if receiver later detects corruption (rare edge case; accepted risk).
- Slightly increased implementation complexity.

## Related Decisions

- FILE_RECEIVED Acknowledgement and NACK-Based Retransmit (ADR-0025) — NACK mechanism remains the reliability foundation
- 500MB File Limit (ADR-0005) — caps worst-case file size
- WebRTC Data Channels for Direct P2P Communication (ADR-0020) — reliable channel assumption
