# 11. File State Machine

**Status**: Accepted  
**Date**: 2026-05-31

## Context

Each file being transferred goes through a lifecycle from offer to completion or failure. We need to track this state to manage the queue, UI, and cleanup.

## Decision

Adopt a **7-state file state machine**:

| State            | Description                                              |
| ---------------- | -------------------------------------------------------- |
| **PENDING**      | File offered, waiting for accept/reject                  |
| **QUEUED**       | File accepted but waiting for current transfer to finish |
| **TRANSFERRING** | Actively sending/receiving chunks                        |
| **COMPLETED**    | All chunks received, ready for download                  |
| **REJECTED**     | Receiver declined the file                               |
| **FAILED**       | Transfer error occurred                                  |
| **CANCELLED**    | Sender cancelled before transfer started                 |

**Transitions:**

- PENDING → QUEUED: Accepted AND another file is TRANSFERRING
- PENDING → TRANSFERRING: Accepted AND no file is TRANSFERRING
- PENDING → REJECTED: Receiver declines
- PENDING → CANCELLED: Sender cancels
- QUEUED → TRANSFERRING: Current TRANSFERRING file completes
- QUEUED → CANCELLED: Sender cancels
- TRANSFERRING → COMPLETED: All chunks received (see ADR-0025 for the FILE_RECEIVED ack gate)
- TRANSFERRING → FAILED: Transfer error (fail-fast) or NACK rounds exhausted (see ADR-0025)

**Queue Logic:**

- On FILE_ACCEPT: If any file TRANSFERRING → QUEUED, else → TRANSFERRING
- On transfer complete: QUEUED file → TRANSFERRING (if queue not empty)

**Cleanup:**

- COMPLETED: chunk data is held in the assembled `ArrayBuffer` only, and the browser's save dialog is triggered immediately on transition (see ADR-0027). No `Download` button is shown because the data is not re-fetchable.
- All others: Delete from IndexedDB on connection close

## Consequences

**Positive:**

- Clear file lifecycle
- Easy to implement queue logic
- UI can show accurate status
- Fail-fast applies to all error states

**Negative:**

- Multiple states to track
- Need to handle state transitions carefully

## Alternatives Considered

1. **Fewer States**: Combine QUEUED and TRANSFERRING. Pros: Simpler. Cons: Less precise for UI.
2. **More States**: Add ACCEPTED state. Pros: More granular. Cons: Unnecessary complexity.
3. **State + Queue Separate**: Track separately. Pros: Decoupled. Cons: More complex coordination.
