# 6. FIFO Queue with Conditional Limits

**Status**: Accepted  
**Date**: 2026-06-03

## Context

Multiple files can be transferred sequentially over a single WebRTC connection. We need to manage the order of transfers and prevent memory overload from too many queued files. With streaming (ADR-0002), the queue limit depends on the storage backend: File System Access API has no memory constraint, while IndexedDB still requires a cap.

## Decision

Use a **FIFO queue** with **conditional limits based on storage backend**:

| Backend | Queue Limit |
|---------|-------------|
| **File System Access API** | No size limit. Cap queue at 100 files (count only). |
| **IndexedDB fallback** | 1GB total size (sum of all queued file sizes). |

**Receiver-driven accept order:** When the sender offers multiple files (batch offer), all files appear as PENDING in the receiver's Files tab. The receiver clicks Accept on one file at a time. While a file is transferring, other accept buttons are disabled. When the transfer completes, accept buttons re-enable for the remaining files. The receiver chooses which file to pull next.

**Sender cancel:** The sender can cancel any PENDING offer (remove a file from the list before the receiver accepts it).

**File states:**
- PENDING → QUEUED (if transfer in progress) or TRANSFERRING (if no transfer)
- QUEUED → TRANSFERRING (when previous transfer completes, receiver selects next)

**Scope:**
The queue is **SEND-only**. It tracks the order in which *this* device sends files to the peer. A received file's progress lives on the `FileTransfer` object itself; it never enters the local send queue. A file is either `currentFile` XOR in `queue`, never both, and only send-direction files ever enter either.

**Safety net:**
`FileQueueManager.startNextFile()` skips any candidate already in a terminal state.

## Consequences

**Positive:**
- Fair ordering (receiver chooses, but within batch, first offered can be first accepted)
- No memory pressure on File System Access API — queue is unconstrained
- IndexedDB fallback has a safe 1GB cap
- Receiver has full control over transfer order
- Sender can clean up accidental picks before they're accepted

**Negative:**
- No priority for important files
- Large files may block the queue for a long time (sequential transfer)
- User cannot reorder queue after accepting
- The accept-buttons-disabled-during-transfer pattern adds UI complexity

## Alternatives Considered

1. **Sender-driven order (FIFO strict)**: Sender picks order, receiver accepts all. Pros: Simpler. Cons: Receiver may not want all files, less control.
2. **No queue, one file at a time**: User must re-initiate for next file. Pros: Simplest. Cons: Tedious UX.
3. **Priority queue**: User assigns priority. Pros: Flexible. Cons: Complex UI, unclear priorities.
4. **Size-based ordering**: Smaller files first. Pros: Faster completion. Cons: Unpredictable order, complex.
