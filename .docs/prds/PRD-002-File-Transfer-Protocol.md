# PRD-002: File Transfer Protocol

## Problem Statement

Once a WebRTC connection is established between two devices, we need to reliably transfer files between them with chunking, queuing, and progress tracking.

## Solution

Implement the file transfer protocol with 8KB chunking, FIFO queue management, binary header format, and bidirectional transfer capability.

## User Stories

### File Offering & Acceptance
1. As a user, I want to select files from my device to send so that I can share them with the connected peer
2. As a user, I want to see file offer notifications from the other device so that I can decide whether to accept
3. As a user, I want to accept file offers so that I can receive the files
4. As a user, I want to reject file offers so that I don't receive unwanted files
5. As a user, I want to see the file name, size, and type before accepting so that I know what I'm receiving
6. As a user, I want accepted files to be queued if another file is currently transferring so that files are processed in order

### File Transfer
7. As a user, I want to see transfer progress for each file so that I know the status
8. As a user, I want to transfer multiple files sequentially so that I can send a batch of files
9. As a user, I want files to be split into 8KB chunks so that large files can be transferred without memory issues
10. As a user, I want to receive files in chunks and reassemble them so that I can access the complete file
11. As a user, I want to send files up to 500MB so that I can share reasonably large files
12. As a user, I want transfers to fail fast on any error so that I don't wait unnecessarily
13. As a user, I want to send files from either device (bidirectional) so that both parties can share files
14. As a user, I want to see which direction files are being sent (sending vs receiving) so that I can track the flow

### Queue Management
15. As a user, I want queued files to wait their turn so that transfers are ordered
16. As a user, I want the queue to be limited to 500MB total so that memory usage is controlled
17. As a user, I want queued files to be discarded when connection closes so that incomplete transfers don't waste space
18. As a user, I want to see queue status (number of files waiting) so that I know what's pending

### Progress & Completion
19. As a user, I want to see progress bars for each file transfer so that I can monitor progress
20. As a user, I want to see a download button for completed files so that I can save them to my device
21. As a user, I want completed files to be automatically cleaned up when downloaded so that storage is freed
22. As a user, I want to see confirmation that a file has been downloaded so that I know the transfer is complete

## Implementation Decisions

### Modules
- **File Chunking Module**: Split files into 8KB chunks with proper headers
- **File Reassembly Module**: Reconstruct files from received chunks
- **File Queue Manager**: Manage FIFO queue of file transfers with 500MB limit
- **Transfer State Machine**: Implement file state machine (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED)
- **Control Message Handler**: Process FILE_OFFER, FILE_ACCEPT, FILE_REJECT, TRANSFER_DONE, CANCELLED messages
- **Batch Processing Module**: Process received chunks in batches for memory efficiency
- **Progress Tracker**: Track and report transfer progress per file

### Interfaces
- `FileChunkingModule.chunkFile(file, fileId) -> Array<Chunk>` - Split file into chunks with headers
- `FileChunkingModule.createChunkHeader(fileId, index, isLast) -> ArrayBuffer` - Create 41-byte header
- `FileReassemblyModule.processChunk(connId, fileId, index, data, isLast)` - Handle incoming chunk
- `FileQueueManager.offerFile(connId, fileMetadata) -> fileId` - Add file to queue
- `FileQueueManager.acceptFile(connId, fileId)` - Accept file offer
- `FileQueueManager.rejectFile(connId, fileId)` - Reject file offer
- `FileQueueManager.getNextFile(connId) -> fileId | null` - Get next file to transfer
- `FileQueueManager.markComplete(connId, fileId)` - Mark file as transferred
- `TransferStateManager.transition(fileState, event) -> newState` - Handle file state transitions
- `ProgressTracker.updateProgress(fileId, bytesReceived, totalBytes)` - Update progress for file
- `ProgressTracker.getProgress(fileId) -> {percent, bytesReceived, totalBytes}` - Get current progress

### Technical Decisions
- 8KB chunk size for all transfers (ADR-0015)
- Fixed 41-byte binary header: fileId (36 bytes) + index (4 bytes) + isLast (1 byte) (ADR-0014)
- FIFO queue with 500MB total size limit (ADR-0009)
- Fail-fast error handling - drop connection on any transfer error (ADR-0006)
- Batch processing for downloads to avoid memory issues (ADR-0008)
- 7-state file state machine (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED) (ADR-0011)
- Separate control channel (JSON) and data channel (binary) (ADR-0007, ADR-0013)
- 500MB universal file size limit (ADR-0005)
- JSON message format for control channel (ADR-0013)
- Binary message format for data channel with header (ADR-0014)

### Queue Behavior
- Files enter PENDING state when offered
- Files move to QUEUED if accepted AND another file is TRANSFERRING
- Files move to TRANSFERRING if accepted AND no file is TRANSFERRING
- On TRANSFERRING completion, next QUEUED file starts automatically
- Queue size limit: 500MB total for all queued files
- Reject new file offers if queue would exceed 500MB
- Discard all queued files on connection close (ADR-0018)

### Control Messages
```
FILE_OFFER: {type: "FILE_OFFER", connId, fileId, name, size, mime}
FILE_ACCEPT: {type: "FILE_ACCEPT", connId, fileId}
FILE_REJECT: {type: "FILE_REJECT", connId, fileId}
TRANSFER_DONE: {type: "TRANSFER_DONE", connId, fileId}
CANCELLED: {type: "CANCELLED", connId, fileId}
CLOSE: {type: "CLOSE", connId}
```

## Testing Decisions

### Test Strategy
- Test file chunking and header creation
- Test file reassembly from chunks
- Test queue management with various scenarios
- Test state machine transitions for files
- Test progress tracking accuracy
- Test batch processing with large files
- Test fail-fast behavior on errors

### Modules to Test
- File chunking with proper header format
- File reassembly from out-of-order chunks (handle with buffering)
- FIFO queue ordering
- Queue size limit enforcement
- State transitions for files
- Progress percentage calculation
- Batch processing memory usage

### Test Approach
- Unit tests for chunking and header creation/parsing
- Unit tests for queue management logic
- Unit tests for state machine transitions
- Integration tests for complete file transfer
- Stress tests with 500MB files
- Memory usage tests for batch processing

## Out of Scope

- QR code handling (PRD-001)
- User interface (PRD-003)
- Storage/persistence (PRD-004)
- Connection management (PRD-001)

## Further Notes

- Chunk header is 41 bytes: 36 bytes UUID fileId + 4 bytes index (big-endian) + 1 byte isLast flag
- Chunk data follows header directly (no separator)
- Malformed messages < 41 bytes on data channel are dropped
- Queue only checks total size of queued files, not the currently transferring file
- Batch processing: chunks are processed in batches and written to IndexedDB
- Per-file progress bars with direction indicator (sending/receiving)
- Download button appears next to progress bar at 100%
