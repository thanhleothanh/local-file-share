# 25. Clean State on Page Reload

**Status**: Accepted
**Date**: 2026-06-03

## Context

The application stores file chunks, metadata, and connection state in IndexedDB (fallback path) and device identity in localStorage. If the user reloads the page mid-transfer or after a session, leftover state from the previous session could accumulate without a way to clean it up. There is no use case for persisting state across reloads — the WebSocket connection is lost, the WebRTC peer connection is lost, and any in-flight transfer is unrecoverable.

## Decision

**All application state is ephemeral.** On every page load, the application deletes all state from the previous session before initializing.

**On page load (before initializing WebSocket/WebRTC):**
1. Delete all IndexedDB databases matching the `LocalFileShare*` pattern
2. Clear all localStorage entries used by the application (device ID, device name)
3. Initialize fresh state (new device ID, empty connection, empty file list)

**No persistence across reloads:**
- No connection retry after reload
- No file transfer resume after reload
- No queued files carried over
- No device list carried over

The user starts fresh every time: device list repopulates from the signaling server, files must be re-selected, connections must be re-established.

## Consequences

**Positive:**
- No orphaned data accumulating in IndexedDB or localStorage
- Predictable state — every page load starts from the same clean baseline
- No stale data from previous sessions confusing the UI
- Simple mental model: reload = restart

**Negative:**
- User loses all in-progress transfers on reload (unavoidable — WebRTC connection is gone anyway)
- User must re-select files after reload
- Device name is regenerated on each load unless persisted (see below)

**Device name persistence:** The auto-generated + editable device name (from the device list UI) is stored in localStorage. On reload, the name is read from localStorage so the user doesn't have to re-enter it. This is the only localStorage entry that survives a reload — it's user preference, not transfer state.

## Alternatives Considered

1. **Persist state across reloads**: Keep connections, queues, and file lists. Cons: WebRTC connections are gone after reload — state would be stale and misleading.
2. **Persist queue only**: Keep queued files, re-offer on reconnect. Cons: Files may be offered to a different device; complex resume logic.
3. **Lazy cleanup**: Only clean up when storage is full. Cons: Accumulates indefinitely, hard to debug.
