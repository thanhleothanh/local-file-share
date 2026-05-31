# ISSUE-002: File Offer and Accept Protocol

## Parent
PRD-002: File Transfer Protocol

## What to build
Implement the file offer and acceptance protocol over the control channel. This includes sending FILE_OFFER messages, displaying offers to the receiver, accepting/rejecting offers, and transitioning file state appropriately.

## Acceptance criteria
- [x] User can select files to send (single or multiple)
- [x] Selected files are validated (size <= 500MB) (ADR-0005)
- [x] FILE_OFFER message sent over control channel with metadata: `{type: "FILE_OFFER", connId, fileId, name, size, mime}`
- [x] Receiver displays incoming file offer notification with file details (name, size, type)
- [x] Receiver can accept file offer (sends FILE_ACCEPT: `{type: "FILE_ACCEPT", connId, fileId}`)
- [x] Receiver can reject file offer (sends FILE_REJECT: `{type: "FILE_REJECT", connId, fileId}`)
- [x] Sender receives accept/reject response and updates file state
- [x] Accepted files transition to QUEUED state if another file is TRANSFERRING
- [x] Accepted files transition to TRANSFERRING state if no file is TRANSFERRING
- [x] Rejected files transition to REJECTED state and are cleaned up
- [x] Sender can cancel pending file offers (sends CANCELLED message)
- [x] File state machine implemented: PENDING -> QUEUED/REJECTED/FAILED (ADR-0011)
- [x] Control channel uses JSON message format (ADR-0013)
- [x] Fail-fast: any protocol error closes connection (ADR-0006)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake - provides control channel)

## User stories covered
1. As a user, I want to select files from my device to send so that I can share them with the connected peer
2. As a user, I want to see file offer notifications from the other device so that I can decide whether to accept
3. As a user, I want to accept file offers so that I can receive the files
4. As a user, I want to reject file offers so that I don't receive unwanted files
5. As a user, I want to see the file name, size, and type before accepting so that I know what I'm receiving
6. As a user, I want accepted files to be queued if another file is currently transferring so that files are processed in order
14. As a user, I want to send files from either device (bidirectional) so that both parties can share files
15. As a user, I want queued files to wait their turn so that transfers are ordered
16. As a user, I want to see a cancel button for pending file offers so that I can cancel before transfer starts

## Notes
- File ID is a UUID (ADR-0024)
- FILE_OFFER messages must be sent after connection is CONNECTED
- File state transitions: PENDING (after offer) -> QUEUED (accepted, waiting) or REJECTED (rejected) or FAILED (error)
- Queue is FIFO (ADR-0009)
- Connection stores track both directions of file offers
