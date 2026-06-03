# 13. Discard Queued Files on Connection Close

**Status**: Accepted  
**Date**: 2026-05-31

## Context

When a connection closes (idle timeout, tab close, error), there may be files in the QUEUED state that were never transferred. We need to decide what happens to these files.

## Decision

**Discard all queued files** when the connection closes. Do not persist them for later transfer.

**Implementation:**
- On connection close: Send CLOSE message (best effort), close WebRTC connection
- On the File System Access API path: no IndexedDB cleanup needed (files are on disk)
- On the IndexedDB fallback path: delete the IndexedDB store for that connection
- All PENDING, QUEUED, and TRANSFERRING files are discarded
- User must re-offer files on next connection

**Cleanup (IndexedDB fallback path):**
```javascript
async function closeConnection(connId) {
  // Send CLOSE message (best effort)
  controlChannel?.send({ type: "CLOSE", connId });
  
  // Close WebRTC
  peerConnection?.close();
  
  // Delete IndexedDB (fallback path only)
  await indexedDB.deleteDatabase(`fileShare-${connId}`);
  
  // Clear queue
  queue = { transferring: null, queued: [] };
  
  // Update state
  setConnectionState(connId, "IDLE");
}
```

## Consequences

**Positive:**
- Clean slate on each new connection
- No orphaned data lingering
- Simple to implement
- Predictable behavior

**Negative:**
- User loses queued files if connection drops
- Must re-select files after reconnecting
- No persistence across connections

## Alternatives Considered

1. **Persist Queued Files**: Keep queued files, auto-offer on reconnect. Pros: User-friendly. Cons: Complex, may offer to wrong device.
2. **Persist + Manual**: Keep queued files, user manually re-offers. Pros: No data loss. Cons: UI complexity, storage management.
3. **Discard + Notify**: Discard and show "X files were queued but not transferred." Pros: User aware. Cons: Slightly more complex.
