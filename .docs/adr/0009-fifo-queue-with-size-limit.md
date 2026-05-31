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

## Consequences

**Positive:**
- Fair ordering (first offered, first transferred)
- Predictable memory usage (max 500MB queued + 500MB transferring = 1GB worst case)
- Simple to implement and understand
- Users see wait status for queued files

**Negative:**
- No priority for important files
- Large files may block queue for long time
- User cannot reorder queue

## Alternatives Considered

1. **LIFO (Stack)**: Last-in-first-out. Pros: Simple. Cons: Unintuitive for users.
2. **Priority Queue**: User assigns priority. Pros: Flexible. Cons: Complex UI, unclear priorities.
3. **Size-Based**: Smaller files first. Pros: Faster completion. Cons: Unpredictable order, complex.
4. **No Queue**: One file at a time, user must re-initiate for next. Pros: Simplest. Cons: Tedious UX.
