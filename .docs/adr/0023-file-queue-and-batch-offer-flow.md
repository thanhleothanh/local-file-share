# 23. File Queue and Batch Offer Flow

**Status**: Accepted  
**Date**: 2026-06-03

## Context

When the sender picks multiple files from the OS file picker, we need to decide: how are they offered to the receiver, who drives the transfer order, and what happens to the queue during an active transfer.

## Decision

### Batch offer

The sender picks files → all files are offered to the receiver at once via the control channel. Each file offer contains: `fileId`, `name`, `size`, `mime`.

### Receiver-driven accept order

The receiver sees all pending offers in the Files tab with accept/reject buttons. The receiver clicks Accept on one file → that file starts streaming, **all other accept buttons are disabled**. When the transfer completes, accept buttons re-enable for the remaining files. The receiver chooses which file to accept next.

### Sender cancel

The sender can cancel any PENDING offer (remove it from the list) before the receiver accepts it. The receiver sees the row disappear.

### Queue behavior

- Only one file transfers at a time (1:1 connection, sequential transfer)
- The queue is SEND-only — tracks files this device sends to the peer
- Accepted files that are not yet transferring enter the queue
- When the current transfer completes, the next accepted file starts automatically
- If the receiver has not yet accepted any other files, the queue is empty and the connection returns to IDLE in the Files tab

### File states in the queue

| State | Meaning |
|-------|---------|
| PENDING | Offered, waiting for receiver to accept/reject |
| QUEUED | Accepted, waiting for current transfer to finish |
| TRANSFERRING | Actively streaming chunks |
| COMPLETED | All chunks sent/received |
| REJECTED | Receiver declined |
| FAILED | Transfer error (fail-fast) |
| CANCELLED | Sender cancelled before transfer started |

### Cancel and disconnect

- **Cancel file**: Both sender and receiver can cancel a file. Cancel immediately aborts (fail-fast), next queued file starts.
- **Disconnect**: Shows confirmation if files are in progress. Kills the connection immediately. All queued files are discarded (ADR-0013).

## Consequences

**Positive:**
- Receiver has full control over which files to accept and in what order
- Sender can clean up accidental picks before they're accepted
- One file at a time simplifies the data channel and progress tracking
- Batch offer gives the receiver full visibility before any data flows

**Negative:**
- Receiver must manually accept each file (no "accept all" option)
- Accept buttons disabled during transfer adds UI state management
- Sender cannot force priority on important files
- Large files in the queue may block smaller files behind them

## Alternatives Considered

1. **Sender-driven FIFO**: Sender picks order, receiver accepts all at once. Cons: Receiver has no control, may not want all files.
2. **Accept all button**: Receiver accepts entire batch with one click. Cons: Cannot selectively reject individual files.
3. **Parallel transfers**: Multiple files stream simultaneously. Cons: Complex, would require multiple data channels or multiplexing, 1:1 connection makes this impractical.
4. **Priority queue**: User assigns priority. Cons: Complex UI, unclear priorities for most users.

## Related Decisions

- FIFO Queue Conditional Limits (ADR-0006) — queue size limits by storage backend
- File State Machine (ADR-0008) — state transitions
- Unified Files Tab (ADR-0018) — UI for accept/reject buttons, progress bars
- Fail-Fast Error Handling (ADR-0003) — cancel behavior
- Discard Queued on Close (ADR-0013) — cleanup on disconnect
- No File Size Limit / Streaming (ADR-0002) — streaming enables unlimited queue on FSA
