# ISSUE-004: Queue Management and Limits

## Parent
PRD-002: File Transfer Protocol

## What to build
Implement the FIFO queue with 500MB size limit, queue state management, and automatic processing.

## Acceptance criteria
- [x] Queue is FIFO (First-In-First-Out) ordered
- [x] Accepted files are added to queue if another file is TRANSFERRING
- [x] Accepted files skip queue and start immediately if no file is TRANSFERRING
- [x] Queue maintains order across multiple files
- [x] Queue size limit: 500MB total for all queued files (ADR-0009)
- [x] New file offers are rejected if adding to queue would exceed 500MB
- [x] User sees queue status: number of files waiting and total queue size in MB
- [x] Queued files are listed separately in UI (in file queue display)
- [x] On transfer completion, next queued file starts automatically
- [x] Queue state is persisted across page reloads (via in-memory state, full persistence requires ISSUE-005)
- [x] Queued files are discarded when connection closes (ADR-0018)
- [x] Queue cleanup removes all queued file data
- [x] Queue ordering is preserved after page reload (via in-memory FIFO queue, full persistence requires ISSUE-005)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake)
- ISSUE-002 (File Offer and Accept Protocol)
- ISSUE-003 (File Chunking and Transfer)

## User stories covered
8. As a user, I want to transfer multiple files sequentially so that I can send a batch of files
15. As a user, I want queued files to wait their turn so that transfers are ordered
16. As a user, I want the queue to be limited to 500MB total so that memory usage is controlled
17. As a user, I want queued files to be discarded when connection closes so that incomplete transfers don't waste space
18. As a user, I want to see queue status (number of files waiting) so that I know what's pending
26. As a user, I want to see queued files listed separately so that I know what's waiting
27. As a user, I want to see the queue size (e.g., "3 files waiting") so that I know how many are pending
28. As a user, I want to see the total queue size in MB so that I can monitor storage usage

## Notes
- Queue size calculation: sum of all queued file sizes (not including currently transferring file)
- Queue limit check happens before accepting file offer
- Queue uses composite keys (connectionId + fileId) for ordering
- Queue state is stored in IndexedDB (PRD-004)
- Queue cleanup is automatic on connection close
