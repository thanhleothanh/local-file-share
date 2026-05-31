# 6. Fail-Fast Error Handling

**Status**: Accepted  
**Date**: 2026-05-31

## Context

When transferring files over an unreliable connection (local WiFi), errors can occur. We need to decide how to handle transfer interruptions, network drops, and other failures.

## Decision

Adopt a **fail-fast** approach: When any error occurs during a file transfer, immediately abort the transfer, clean up partial data, and notify the user. Do not attempt to resume or retry.

**Error types that trigger fail-fast:**
- TRANSFER_FAILED: Chunk send/receive error
- CONNECTION_LOST: WebRTC connection drops
- INVALID_SECRET: QR secret mismatch
- TIMEOUT: Idle timeout expires
- USER_REJECTED: Receiver declines file
- QUEUE_FULL: Queue limit exceeded
- FILE_TOO_LARGE: File exceeds 500MB
- CANCELLED: User cancels transfer

## Consequences

**Positive:**
- Simple implementation
- Predictable behavior
- No complex resume logic
- Users know immediately if something fails
- Memory is freed quickly (no partial transfers lingering)

**Negative:**
- User must restart transfer from beginning after failure
- No progress saved on interruption
- Large files may need to be re-sent entirely after minor interruptions

## Alternatives Considered

1. **Resume from Last Chunk**: Track received chunks, request missing ones. Pros: User-friendly. Cons: Complex, requires tracking state, partial files linger in storage.
2. **Auto-Retry**: Automatically retry failed transfers. Pros: Convenient. Cons: May retry indefinitely, wastes bandwidth.
3. **Checkpoint Resume**: Save progress at intervals. Pros: Better than nothing. Cons: Complex, still loses some data.
