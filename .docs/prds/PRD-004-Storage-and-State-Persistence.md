# PRD-004: Storage and State Persistence

## Problem Statement

Files being transferred need to be temporarily stored in the browser, and connection/file state needs to persist across page reloads (within the same tab session).

## Solution

Implement IndexedDB-based storage for file chunks and metadata, with automatic cleanup on connection close or file download.

## User Stories

### File Storage
1. As a user, I want received file chunks to be stored temporarily so that I can download the complete file even if it takes time
2. As a user, I want sent file chunks to be read efficiently so that I can send large files without memory issues
3. As a user, I want storage to be per-connection so that different connections don't interfere
4. As a user, I want queued files to be stored so that they can be transferred when it's their turn
5. As a user, I want downloaded files to be cleaned up so that storage space is freed
6. As a user, I want incomplete transfers to be cleaned up on connection close so that storage doesn't fill up

### State Persistence
7. As a user, I want connection state to survive page reloads so that transfers can continue if I accidentally refresh
8. As a user, I want file transfer state to persist so that progress isn't lost on page reload
9. As a user, I want the application to recover gracefully if I close and reopen the tab so that I can resume active transfers
10. As a user, I want queued files to be restored after page reload so that they continue waiting

### Cleanup
11. As a user, I want completed files to be removed after download so that storage is freed
12. As a user, I want all connection data to be cleaned up when connection closes so that there's no data leakage
13. As a user, I want to see storage usage information so that I know how much space is being used

## Implementation Decisions

### Modules
- **IndexedDB Wrapper**: Generic wrapper for IndexedDB operations with error handling
- **File Chunk Store**: Store and retrieve file chunks by connection ID and file ID
- **File Metadata Store**: Store file metadata (name, size, type, state, progress)
- **Connection State Store**: Store connection metadata (connection ID, secret, state, timestamp)
- **Cleanup Manager**: Automatic cleanup of completed/downloaded files and closed connections
- **Queue Store**: Store queued file references with ordering

### Database Schema

#### Stores (Object Stores)
- **`connections`**: Connection metadata
  - Key: connectionId (string)
  - Value: {connId, secret, state, createdAt, lastActivityAt, peerInfo?}

- **`files`**: File metadata
  - Key: composite key (connectionId + fileId) (string)
  - Value: {connId, fileId, name, size, mime, state, createdAt, completedAt?, direction}

- **`chunks`**: File chunk data
  - Key: composite key (connectionId + fileId + index) (string)
  - Value: {connId, fileId, index, data (ArrayBuffer), isLast}

- **`queue`**: File queue
  - Key: composite key (connectionId + fileId) (string)
  - Value: {connId, fileId, order (number)}

### Interfaces
- `StorageManager.openDB() -> Promise<IDBDatabase>` - Open or create IndexedDB
- `FileChunkStore.saveChunk(connId, fileId, index, data, isLast) -> Promise<void>` - Store a chunk
- `FileChunkStore.getChunk(connId, fileId, index) -> Promise<ArrayBuffer | null>` - Retrieve a chunk
- `FileChunkStore.getAllChunks(connId, fileId) -> Promise<Map<number, ArrayBuffer>>` - Get all chunks for a file
- `FileChunkStore.deleteFile(connId, fileId) -> Promise<void>` - Delete all chunks for a file
- `FileMetadataStore.saveFile(connId, fileMetadata) -> Promise<void>` - Save file metadata
- `FileMetadataStore.getFile(connId, fileId) -> Promise<FileMetadata | null>` - Get file metadata
- `FileMetadataStore.updateFileState(connId, fileId, state) -> Promise<void>` - Update file state
- `FileMetadataStore.deleteFile(connId, fileId) -> Promise<void>` - Delete file metadata
- `ConnectionStore.saveConnection(connId, secret, state) -> Promise<void>` - Save connection
- `ConnectionStore.getConnection(connId) -> Promise<Connection | null>` - Get connection
- `ConnectionStore.updateConnectionState(connId, state) -> Promise<void>` - Update connection state
- `ConnectionStore.deleteConnection(connId) -> Promise<void>` - Delete connection and all related data
- `QueueStore.addToQueue(connId, fileId, order) -> Promise<void>` - Add file to queue
- `QueueStore.getQueue(connId) -> Promise<FileId[]>` - Get ordered queue for connection
- `QueueStore.removeFromQueue(connId, fileId) -> Promise<void>` - Remove file from queue
- `QueueStore.getQueueSize(connId) -> Promise<number>` - Get total size of queued files
- `CleanupManager.cleanupFile(connId, fileId) -> Promise<void>` - Cleanup file and all chunks
- `CleanupManager.cleanupConnection(connId) -> Promise<void>` - Cleanup all data for connection

### Technical Decisions
- Use IndexedDB for storage (only browser-based persistence option)
- Composite keys for per-connection storage (ADR context: store per connection)
- Files stored in 8KB chunks (ADR-0015)
- Chunk header metadata NOT stored in DB (only the data portion)
- Batch processing: chunks written to IndexedDB in batches (ADR-0008)
- Discard queued files on connection close (ADR-0018)
- Fail-fast: on any storage error, drop connection (ADR-0006)
- Cleanup on download: remove from storage when download button clicked
- Cleanup on connection close: remove all connection data including queued files

### Storage Strategy
- **Sending**: Read file in 8KB chunks, send via data channel
- **Receiving**: Write chunks to IndexedDB as they arrive, in batches
- **Batch size**: Process and store chunks in batches of 10-20 for memory efficiency
- **IndexedDB transaction mode**: Read-write transactions for writes, read-only for reads

### Cleanup Triggers
- File download: Remove file metadata and all chunks
- Connection close: Remove all connection data (metadata, chunks, queue)
- Transfer completion: Keep file until downloaded, then cleanup
- Connection timeout: Close connection and cleanup all data

## Testing Decisions

### Test Strategy
- Test IndexedDB schema creation and versioning
- Test CRUD operations for all stores
- Test composite key handling
- Test batch processing performance
- Test cleanup functionality
- Test error handling (quota exceeded, blocked, etc.)
- Test data isolation between connections

### Modules to Test
- IndexedDB wrapper functionality
- File chunk storage and retrieval
- File metadata storage and retrieval
- Connection state persistence
- Queue management
- Cleanup operations
- Batch processing

### Test Approach
- Unit tests for storage operations using fake IndexedDB (or in-memory mock)
- Integration tests with real IndexedDB in test browsers
- Stress tests with many files/chunks
- Quota exceeded tests
- Transaction failure tests

## Out of Scope

- User interface (PRD-003)
- WebRTC connection logic (PRD-001)
- File transfer protocol (PRD-002)
- Server-side storage (purely browser-based)

## Further Notes

- IndexedDB is chosen because it's the only persistent storage option in browsers
- Composite keys ensure isolation: connection1's files don't conflict with connection2's files
- Chunk storage uses fileId + index as part of the key for efficient retrieval
- Batch processing reduces memory pressure when receiving large files
- Cleanup is automatic: no user intervention required
- Storage usage can be queried via `navigator.storage.estimate()` for UI display
- All IndexedDB operations should use promises for async handling
- Error handling: any IndexedDB error should trigger fail-fast (close connection)
