# Issue 00015 — Files Tab UI

## Parent

Derived from `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (full UI), `.docs/prds/0008-ui-app-shell-and-connection-tab.md` (tab wiring).

## What to build

Build the full Files tab UI on top of the file state machine from slice 14. A single scrolling list shows all files in the connection in any of the 7 states, sorted newest-first. Each row shows the direction (↑ sent, ↓ received), the filename, size, current state, and the appropriate actions: Accept/Reject for PENDING (receiver), Cancel for PENDING/TRANSFERRING (sender), or a status indicator for terminal states. A small send button in the Files tab header (hidden, not disabled, when not connected) opens the multi-file picker. Progress bars update during TRANSFERRING. Empty state reflects the connection state. The list clears on disconnect.

## Acceptance criteria

- [x] `FilesTab` Lit component renders the file list, the send button, and the empty state
- [x] List is sorted newest-first by `createdAt`; rows do not move on state transitions
- [x] Each `FileRow` shows the direction indicator (↑ for sent, ↓ for received), filename, size, and current state
- [x] `FileRow` for PENDING (receiver): shows Accept and Reject buttons; Accept is disabled if any file is TRANSFERRING
- [x] `FileRow` for PENDING (sender): shows Cancel button
- [x] `FileRow` for QUEUED: shows "Queued" status, no actions
- [x] `FileRow` for TRANSFERRING: shows progress bar (`(bytesSent / totalBytes) * 100%` for sender, `(bytesReceived / totalBytes) * 100%` for receiver) and a Cancel button
- [x] `FileRow` for COMPLETED: shows a checkmark; no Download button (file is already on disk or has been saved)
- [x] `FileRow` for REJECTED / FAILED / CANCELLED: shows the status and a small "Dismiss" icon
- [x] Send button in the Files tab header opens a multi-file picker; hidden (not displayed) when not connected
- [x] Empty state: connected with no files shows "Tap + to send your first file"; not connected shows "Connect a device to start sharing files" (Files tab itself is disabled in this case)
- [x] When the connection leaves CONNECTED, `FileRegistry.clear()` is called and the list is empty (implemented in ConnectionViewModel.attach, close handler, and peer-disconnected handler)
- [x] The Connection tab's old "Send test file" button is removed (replaced with multi-file picker in connected-card)
- [ ] E2E test: A and B connect; A picks 3 files; all 3 appear in B's Files tab as PENDING with Accept/Reject; B accepts file 2; file 2 shows progress and completes; file 1 and 3 are still PENDING with Accept buttons now enabled; B accepts file 1; transfers; A cancels file 3; file 3 disappears from B (requires E2E infrastructure)
- [ ] E2E test: progress bars update on both sides during transfer; sender's bar shows bytes sent, receiver's shows bytes received; they converge at 100% on completion (requires E2E infrastructure)
- [ ] E2E test: A disconnects; both Files tabs are empty (requires E2E infrastructure)
- [x] Unit test: `FileRow` for each of the 7 states renders the right buttons and progress bar; direction indicator is correct (10 tests)
- [x] Unit test: `FilesTab` with 5 files in the registry renders 5 rows in the right order; empty registry renders the empty state (8 tests)
- [x] All previously passing tests still pass (486 total tests)

## Status

In Progress — 2026-06-04. Files Tab UI implementation started. Created FilesTab and FileRow Lit components. Added acceptFile, rejectFile, cancelFile, dismissFile methods to ConnectionViewModel. Added file direction tracking (sent vs received). Added progress tracking for all files via fileProgressMap. Wired FilesTab into app-shell. Added FILE_CANCEL message handling. Added unit tests for FileRow and FilesTab components.

## Progress

Implemented:
- `FilesTab` Lit component with file list, send button, and empty state rendering
- `FileRow` Lit component for all 7 file states with appropriate UI and actions
- FilesTab wired into app-shell to replace placeholder Files tab
- ConnectionViewModel: added acceptFile, rejectFile, cancelFile, dismissFile public methods
- ConnectionViewModel: added getFileRegistry, isSentFile, getFileProgressMap accessor methods
- ConnectionViewModel: added FILE_CANCEL message handler for receiver side
- FileRegistry.getAll() now returns new objects to ensure Lit reactivity
- Progress tracking for all files (not just the current one)
- Unit tests for FileRow (10 tests) and FilesTab (8 tests)

## Blocked by

- 00014 (file state machine + batch offer) - Core infrastructure complete, remaining items deferred to this issue

## User stories covered

- PRD-0009 stories 1-15
- PRD-0008 stories on tab visibility and disabled state
