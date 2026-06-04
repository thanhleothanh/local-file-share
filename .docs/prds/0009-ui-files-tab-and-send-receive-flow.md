# PRD 0009 — UI: Files Tab & Send/Receive Flow

## Problem Statement

The user needs a single screen that shows every file in the connection — pending offers, queued, transferring, completed, failed — and an entry point to send new files. The screen must show honest progress on both sides (sender and receiver each see their own bytes-sent / bytes-received), batch-accept files from the sender, and let the receiver drive the accept order. Without a clean component decomposition, the row logic (one of seven states) gets tangled with the list logic (sorting, batch handling) and the protocol logic.

## Solution

A `FilesTab` component that owns the list and the send button. A `FileRow` component that owns the rendering for a single file in any of its seven states. The rows are "dumb" — they receive a `File` and emit events. The `FilesTab` holds the in-memory file list (or subscribes to the `FileRegistry` from PRD 0007) and orchestrates the send / accept / reject / cancel actions. A `FileActionsViewModel` mediates between the UI and the lower-level modules (`FileSender`, `FileReceiver`, `StorageBackendFactory`).

## User Stories

1. As a user, I want to see a single list of all files in the connection (PENDING, QUEUED, TRANSFERRING, COMPLETED, etc.), so that I have one screen for everything.
2. As a user, I want the send action to be a small button in the Files tab header, so that it is easy to find.
3. As a user, I want the send action to be hidden (not just disabled) when not connected, so that the empty state is clear.
4. As a sender, I want to pick multiple files at once and have them all appear in the receiver's Files tab, so that I can offer a batch.
5. As a receiver, I want to see all pending offers with accept/reject buttons, so that I can choose which to take.
6. As a receiver, I want to accept one file at a time (other accept buttons disabled during transfer), so that only one file streams at once.
7. As a sender, I want to see a progress bar based on bytes sent, so that I know how the transfer is going.
8. As a receiver, I want to see a progress bar based on bytes received, so that I know how the transfer is going.
9. As a sender, I want to cancel a PENDING offer, so that I can clean up accidental picks.
10. As either side, I want to cancel a TRANSFERRING file, so that I can stop a long transfer.
11. As a user, I want the empty state to reflect the connection state ("Connect a device to start sharing files" vs "Tap + to send your first file"), so that the screen is self-explanatory.
12. As a user, I want the file list to be sorted newest-first, so that recent activity is at the top.
13. As a user, I want the list to be cleared when I disconnect, so that the next connection starts fresh.
14. As a user on Chromium, I want files to save to disk automatically (no dialog per file), so that I am not interrupted.
15. As a user on Safari, I want a save dialog to appear when each file completes, so that I can save it.

## Implementation Decisions

### Module: `FilesTab`
- Renders the file list, the send button, and the empty state
- Subscribes to the `FileRegistry` (PRD 0007) for the list
- On send button click, opens the OS file picker (multi-select), then calls `FileActionsViewModel.offerFiles(fileList)`
- List is sorted by `createdAt` descending — newest first
- Single responsibility: render the file list. Does not know about state transitions or protocol details.

### Module: `FileRow`
- Renders a single file in any of its 7 states
- For `PENDING` (receiver): shows name, size, Accept, Reject buttons. Accept button is disabled if any other file is `TRANSFERRING`.
- For `PENDING` (sender): shows name, size, Cancel button.
- For `QUEUED`: shows name, size, "Queued" status.
- For `TRANSFERRING`: shows name, size, progress bar (bytes sent or received / total), Cancel button.
- For `COMPLETED`: shows name, size, checkmark. No download button (per ADR-0018 — the file is already on disk or has been saved).
- For `REJECTED` / `FAILED` / `CANCELLED`: shows name, size, status, dismiss button.
- Direction indicator: ↑ for sent, ↓ for received.
- Emits events: `accept-clicked`, `reject-clicked`, `cancel-clicked`.
- Single responsibility: render one row. Does not know about the list or the protocol.

### Module: `EmptyState` (reused from PRD 0008)
- Renders the empty-state message based on connection state
- Connected, no files: "Tap + to send your first file" (send button visible)
- Not connected: handled by `ConnectionTab` (the Files tab is disabled, so this state is not shown)

### Module: `FileActionsViewModel`
- Wires together `FileQueue` (PRD 0007), `FileSender` (PRD 0006), `FileReceiver` (PRD 0006), `StorageBackendFactory` (PRD 0002)
- Methods:
  - `offerFiles(files: File[]): Promise<void>` — generates a `fileId` for each, sends `FILE_OFFER` over the control channel for each, adds them to the `FileRegistry` with `state: PENDING`
  - `acceptFile(fileId): Promise<void>` — sends `FILE_ACCEPT`, transitions to `QUEUED` or `TRANSFERRING`
  - `rejectFile(fileId): Promise<void>` — sends `FILE_REJECT`, transitions to `REJECTED`
  - `cancelFile(fileId): Promise<void>` — sends `CANCELLED`, transitions to `CANCELLED` (or `FAILED` if `TRANSFERRING`)
- Wires the queue's `next-file` event to `FileSender.sendFile`
- Wires `FileSender`'s completion event to `FileRegistry.update({state: COMPLETED})` and `FileQueue.dequeue`
- Single responsibility: orchestrate the file actions. The UI components depend on this, not on the lower-level modules (Dependency Inversion).

### Module: `FileActionsViewModel` storage integration
- On the first incoming file (receiver side), the FSA path calls `showSaveFilePicker` to get a directory handle. Subsequent files reuse it.
- On the IndexedDB path, no picker is needed — chunks are buffered in IndexedDB, and `DownloadLauncher.assembleAndSave` is called on completion.
- The view model calls `StorageBackendFactory.detect()` at construction to pick the backend.

### Progress reporting
- `FileSender` emits `progress(fileId, bytesSent, totalBytes)` after each chunk
- `FileReceiver` emits `progress(fileId, bytesReceived, totalBytes)` after each chunk
- `FileActionsViewModel` forwards these to the `FileRegistry.update` call
- `FileRow` reads `bytesSent` / `totalBytes` from the file and renders a progress bar

### File list lifecycle
- Added on `FILE_OFFER` send or receive
- Updated on every state transition and progress event
- Cleared on connection close (`ConnectionViewModel` triggers `FileRegistry.clear()`)

### Direction indicator
- ↑ for files this device sent
- ↓ for files this device received
- A row does not move on state transitions (per ADR-0018)

### Solid application
- **S** — `FilesTab` does the list, `FileRow` does a row, `FileActionsViewModel` does the orchestration
- **O** — adding a new file action (e.g., "resend" for failed files) is a new method on the view model; the row component is unchanged
- **L** — `FileActionsViewModel` can be swapped for a `MockFileActionsViewModel` in tests without UI changes
- **I** — `FileRow` exposes only the events the row cares about; the list does not need to know about progress updates
- **D** — `FilesTab` depends on `FileActionsViewModel` and `FileRegistry`, not on the protocol modules

## Testing Decisions

### What makes a good test
- Test the UI via Playwright E2E — full browser, real WebSocket, real WebRTC
- Unit-test `FileActionsViewModel` with mocked `FileSender`, `FileReceiver`, `FileRegistry`, `FileQueue`
- Unit-test the row component with various state combinations

### Modules to test
- `FileActionsViewModel` (unit, Vitest) — `offerFiles` with 3 files sends 3 `FILE_OFFER` messages and adds 3 files to the registry with `PENDING`. `acceptFile` sends `FILE_ACCEPT` and updates the state. `cancelFile` from `PENDING` sends `CANCELLED` and updates to `CANCELLED`. `cancelFile` from `TRANSFERRING` aborts the sender and updates to `FAILED`.
- `FileRow` (unit, Vitest with `happy-dom`) — for each of the 7 states, mount the row with a mock file and assert the right buttons and progress bar are rendered. Direction indicator is correct (↑ / ↓).
- `FilesTab` (unit, Vitest with `happy-dom`) — given a registry with 5 files, renders 5 rows sorted by `createdAt` descending. Given an empty registry, renders the empty state.
- Full send flow (E2E, Playwright) — two browser contexts, establish connection, sender clicks +, picks 3 files, verify receiver sees 3 PENDING rows. Receiver clicks Accept on file 2, verify file 2 starts transferring, files 1 and 3 are disabled. Sender sees progress bar on file 2. Verify file 2 completes on both sides. Receiver clicks Accept on file 1, verify it transfers. Sender cancels file 3 (still PENDING), verify it disappears from receiver's list.
- Disconnect clears list (E2E, Playwright) — transfer a file, complete it, disconnect, verify list is empty on both sides.

### Test framework
- Vitest for unit tests (with `happy-dom`)
- Playwright for E2E (multi-context)

### Prior art
None. Pattern: each component test mounts with a synthetic file and asserts DOM. The view model test wires mocks and asserts on the orchestration.

## Out of Scope

- The Connection tab (PRD 0008)
- Toast notifications for send/accept/reject success (PRD 0010)
- The actual file transfer protocol (PRD 0006)
- File preview, file open, file rename — completed files are on disk, the user opens them via the OS

## Further Notes

- The send button uses the OS file picker via `<input type="file" multiple>`. Multi-select is supported on all browsers.
- On the IndexedDB fallback, the save dialog appears per file on completion. The view model calls `DownloadLauncher.assembleAndSave` after `COMPLETED` is reached.
- The "Cancel" button on a `TRANSFERRING` file shows a confirmation prompt for large files (> 100 MB) to prevent accidental loss. Smaller files cancel immediately.
- The file list does not paginate — for typical batch sizes (1-20 files), a scrollable list is sufficient.
- A row's progress bar uses `width: ${(bytesSent / totalBytes) * 100}%`. The bar is on the row, not in a separate column, to keep the layout compact.
- The "↑" and "↓" direction indicators are unicode arrows. They are not emoji — the platform font renders them as monochrome glyphs, matching the design language.
