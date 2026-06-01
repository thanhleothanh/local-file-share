# 9. FIFO Queue with 500MB Size Limit

**Status**: Accepted  
**Date**: 2026-05-31

## Context

Multiple files can be transferred sequentially over a single WebRTC connection. We need to manage the order of transfers and prevent memory overload from too many queued files.

## Decision

Use a **FIFO (First-In-First-Out) queue** with a **500MB total size limit** for queued files (not including the currently transferring file).

**Implementation:**
- New file offers are added to the end of the queue
- When current transfer completes, next file in queue starts automatically
- Queue size check: sum of all queued file sizes ≤ 500MB
- If queue is full, `FILE_REJECT` with reason `QUEUE_FULL`

**File states:**
- PENDING → QUEUED (if transfer in progress) or TRANSFERRING (if no transfer)
- QUEUED → TRANSFERRING (when previous transfer completes)

**Scope (clarified in branch `feature/fix-file-transfer`):**
The queue is **SEND-only**. It tracks the order in which *this* device sends files to the peer. A received file's progress lives on the `FileTransfer` object itself; it never enters the local send queue, even though it shares the same state machine. The earlier code path that assigned the received file to `queueManager.currentFile` was a bug — it caused a completed receive to pin the "current" slot, so the next user-initiated send got pushed to `QUEUED` and never drained. The rule is now: a file is either `currentFile` XOR in `queue`, never both, and only send-direction files ever enter either.

**Safety net (added in branch `feature/fix-file-transfer`):**
`FileQueueManager.startNextFile()` now `while`-loops the queue, skipping any candidate that is already in a terminal state. This guards against the rare race where a file lands in the queue in a state other than `QUEUED` (e.g. `COMPLETED` because of an early return from `handleFileAccept`).

## Consequences

**Positive:**
- Fair ordering (first offered, first transferred)
- Predictable memory usage (max 500MB queued + 500MB transferring = 1GB worst case)
- Simple to implement and understand
- Users see wait status for queued files
- Bidirectional flows are safe: a completed receive cannot block the next send

**Negative:**
- No priority for important files
- Large files may block queue for long time
- User cannot reorder queue

## Alternatives Considered

1. **LIFO (Stack)**: Last-in-first-out. Pros: Simple. Cons: Unintuitive for users.
2. **Priority Queue**: User assigns priority. Pros: Flexible. Cons: Complex UI, unclear priorities.
3. **Size-Based**: Smaller files first. Pros: Faster completion. Cons: Unpredictable order, complex.
4. **No Queue**: One file at a time, user must re-initiate for next. Pros: Simplest. Cons: Tedious UX.
