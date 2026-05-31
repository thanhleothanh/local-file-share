# ISSUE-003: File Chunking and Transfer

## Parent
PRD-002: File Transfer Protocol

## What to build
Implement file chunking, transfer over data channel, and reassembly. This includes splitting files into 8KB chunks with 41-byte binary headers, sending/receiving chunks, and reassembling files.

## Acceptance criteria
- [x] File chunking splits files into 8KB chunks (ADR-0015)
- [x] Each chunk has 41-byte binary header: fileId (36 bytes UUID) + index (4 bytes big-endian) + isLast (1 byte)
- [x] Header format matches ADR-0014 specification
- [x] Chunks are sent sequentially over data channel
- [x] Receiver parses 41-byte header from incoming binary data
- [x] Malformed data (< 41 bytes) on data channel is dropped
- [x] Receiver stores chunks and tracks received indices
- [x] Receiver handles out-of-order chunks with buffering
- [x] Receiver reassembles file when all chunks received (isLast = true)
- [x] File state transitions: TRANSFERRING -> COMPLETED on successful transfer
- [x] TRANSFER_DONE message sent on completion: `{type: "TRANSFER_DONE", connId, fileId}`
- [x] Transfer fails fast on any error (ADR-0006)
- [ ] Failed transfers transition to FAILED state and close connection (partial - state transition implemented, connection close on fail not yet)
- [x] Next file in queue starts automatically on transfer completion
- [ ] Progress is tracked per file (bytes received vs total) (UI for progress not fully implemented yet)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake - provides data channel)
- ISSUE-002 (File Offer and Accept Protocol - provides file metadata and state management)

## User stories covered
7. As a user, I want to see transfer progress for each file so that I know the status
9. As a user, I want files to be split into 8KB chunks so that large files can be transferred without memory issues
10. As a user, I want to receive files in chunks and reassemble them so that I can access the complete file
11. As a user, I want to send files up to 500MB so that I can share reasonably large files
12. As a user, I want transfers to fail fast on any error so that I don't wait unnecessarily
13. As a user, I want to send files from either device (bidirectional) so that both parties can share files
14. As a user, I want to see which direction files are being sent (sending vs receiving) so that I can track the flow
19. As a user, I want to see progress bars for each file transfer so that I can monitor progress
20. As a user, I want to see a download button for completed files so that I can save them to my device

## Notes
- Binary header format (41 bytes):
  - fileId: 36 bytes (UUID string)
  - index: 4 bytes (big-endian uint32)
  - isLast: 1 byte (0 = false, 1 = true)
- Chunk data follows header directly with no separator
- Data channel is binary (ADR-0007, ADR-0014)
- Batch processing for downloads (ADR-0008) - chunks processed in batches
- Progress tracking: bytesReceived / totalBytes * 100
