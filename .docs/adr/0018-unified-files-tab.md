# 18. Unified Files Tab

**Status**: Accepted  
**Date**: 2026-06-03

## Context

The Files panel is the screen where the user sees what they have sent, what they have received, and what is in flight — the answer to "what is the connection doing?". The panel serves multiple purposes: surface in-flight transfers, show completed transfers, and provide an entry point to send new files.

With streaming file transfer (ADR-0002) and batch file offers, the Files tab must accommodate: both-side progress, batch accept/reject, and auto-save to disk.

## Decision

### A. One list, no filters, sorted by `createdAt`

- Single scrolling list of rows. No separate sub-sections, no filter chips.
- Sort order: newest first by `createdAt`.
- A row does not move on state transitions.

### B. Direction, not role

- Every row shows a direction indicator (↑ send, ⬇ receive).
- The same panel layout works for both peers — no role-switching.

### C. Progress on both sides

- **Sender**: Progress bar based on bytes sent / total file size (known from the File API).
- **Receiver**: Progress bar based on bytes received / total file size.
- Two independent progress bars, both honest about what they measure. They won't be perfectly in sync (network latency, receiver write speed), but each side sees its own accurate progress.

### D. Batch file offer with receiver-driven accept

- Sender picks files → all files appear as PENDING in the receiver's Files tab.
- Receiver sees all offers with accept/reject buttons.
- Receiver clicks Accept on one file → that file starts streaming, all other accept buttons are **disabled**.
- Transfer completes → accept buttons re-enable for remaining files.
- Receiver chooses which file to accept next (drives the order).
- Sender can cancel any PENDING offer before the receiver accepts it.

### E. File save mechanism

**File System Access API (Chromium):**
- Receiver grants directory permission once (prompted on first incoming file or when user enables receiving).
- All subsequent files auto-save to that directory.
- "Open downloads folder" link in the UI.

**IndexedDB fallback (Safari/iOS):**
- Browser save dialog triggered per file on completion.
- Chunks assembled into Blob, then `saveBlob()` called.

### F. Send button in the header, hidden until connected

- The Files header shows the panel title and a send action (small button at the right end).
- Visible only when connection is `CONNECTED`. Hidden (not disabled) otherwise.

### G. Empty state reflects connection state

- Connected, no files: "Tap + to send your first file" (send action visible).
- Not connected, no files: "Connect a device to start sharing files" (send action hidden).

### H. Clear the list on disconnect

- When connection leaves CONNECTED state, the in-memory file list is cleared.
- New connection = new session. Clean slate.

### I. No `Download` button on completed receives

- File System Access API: file is already on disk, no re-download needed.
- IndexedDB fallback: data is consumed during assembly, nothing to re-download.
- User can use browser's downloads tray or the "Open downloads folder" link.

## Consequences

**Positive:**
- One screen, one scroll, one list, one button — uniform model.
- Both sides show honest progress (sender: bytes sent, receiver: bytes received).
- Receiver has full control over which files to accept and in what order.
- Auto-save to directory eliminates per-file dialog on Chromium.
- Hiding send button (not disabling) is unambiguous.

**Negative:**
- The accept-buttons-disabled-during-transfer pattern requires careful state management.
- Two storage paths (File System Access API vs IndexedDB) add code complexity.
- Receiver-driven order means the sender cannot force priority.
- Clearing list on disconnect removes session history.

## Alternatives Considered

1. **Sender-driven order (FIFO strict)**: Simpler. Cons: Receiver has no control over file order.
2. **Progress on sender only**: Simpler UI. Cons: Receiver has no progress visibility.
3. **Progress on receiver only**: Sender has no progress visibility.
4. **Per-file download dialog**: Familiar UX. Cons: Annoying with multiple files, breaks auto-save.
5. **Keep Download button**: Redundant with auto-save. Cons: Would fail if data is not persisted.
6. **Three panels (Sender / Receiver / Queue)**: More structured. Cons: Cluttered, no global view.
7. **Filter chips**: Allow filtering by status. Cons: Added UI complexity, unused in practice.

## Related Decisions

- File State Machine (ADR-0008) — seven states are the source of truth
- No File Size Limit / Streaming (ADR-0002) — both-side progress enabled by known file size
- 1:1 Connections (ADR-0012) — both peers see the same Files panel
- FIFO Queue Conditional Limits (ADR-0006) — receiver-driven accept order
- FILE_RECEIVED Ack and NACK (ADR-0016) — file transfer protocol unchanged
- Toast Notifications (ADR-0024) — success/error messages via toast, not inline in Files tab
