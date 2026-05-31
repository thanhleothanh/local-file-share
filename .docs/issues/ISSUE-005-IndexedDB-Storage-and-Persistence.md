# ISSUE-005: IndexedDB Storage and Persistence

## Parent
PRD-004: Storage and State Persistence

## What to build
Implement IndexedDB-based storage for file chunks, metadata, connection state, and queue persistence. This enables file transfers to survive page reloads.

## Acceptance criteria
- [x] IndexedDB database opened with proper schema versioning
- [x] Four object stores created: connections, files, chunks, queue
- [x] Connections store: key=connectionId, value={connId, secret, state, createdAt, lastActivityAt, peerInfo?}
- [x] Files store: key=composite(connectionId+fileId), value={connId, fileId, name, size, mime, state, createdAt, completedAt?, direction}
- [x] Chunks store: key=composite(connectionId+fileId+index), value={connId, fileId, index, data(ArrayBuffer), isLast}
- [x] Queue store: key=composite(connectionId+fileId), value={connId, fileId, order}
- [x] File chunks are stored as they arrive (batch processing for memory efficiency)
- [x] File chunks can be retrieved by connectionId, fileId, and index
- [x] All chunks for a file can be retrieved and reassembled
- [x] Connection state persists across page reloads (integrated with connection manager)
- [x] File transfer state persists across page reloads (integrated with file manager)
- [x] Queued files persist across page reloads (integrated with queue manager via file manager)
- [x] Downloaded files are cleaned up from storage
- [x] All connection data cleaned up on connection close
- [x] Storage usage can be queried via navigator.storage.estimate()
- [x] All IndexedDB operations use promises for async handling
- [x] Any IndexedDB error triggers fail-fast (close connection) (integrated with error handler)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake - provides connection context)

## User stories covered
1. As a user, I want received file chunks to be stored temporarily so that I can download the complete file even if it takes time
2. As a user, I want sent file chunks to be read efficiently so that I can send large files without memory issues
3. As a user, I want storage to be per-connection so that different connections don't interfere
4. As a user, I want queued files to be stored so that they can be transferred when it's their turn
7. As a user, I want connection state to survive page reloads so that transfers can continue if I accidentally refresh
8. As a user, I want file transfer state to persist so that progress isn't lost on page reload
9. As a user, I want the application to recover gracefully if I close and reopen the tab so that I can resume active transfers
10. As a user, I want queued files to be restored after page reload so that they continue waiting
11. As a user, I want completed files to be removed after download so that storage is freed
12. As a user, I want all connection data to be cleaned up when connection closes so that there's no data leakage
13. As a user, I want to see storage usage information so that I know how much space is being used

## Notes
- Uses IndexedDB (ADR-0021)
- Composite keys ensure isolation between connections
- Chunks stored in batches of 10-20 for memory efficiency (ADR-0008)
- Chunk storage uses fileId + index as part of the key
- Cleanup is automatic: no user intervention required
- All storage operations are async with proper error handling
- Error handling: any IndexedDB error should trigger fail-fast (close connection) (ADR-0006)
