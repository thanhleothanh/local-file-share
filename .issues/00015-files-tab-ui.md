# Issue 00015 — Files Tab UI

## Parent

Derived from `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (full UI), `.docs/prds/0008-ui-app-shell-and-connection-tab.md` (tab wiring).

## What to build

Build the full Files tab UI on top of the file state machine from slice 14. A single scrolling list shows all files in the connection in any of the 7 states, sorted newest-first. Each row shows the direction (↑ sent, ↓ received), the filename, size, current state, and the appropriate actions: Accept/Reject for PENDING (receiver), Cancel for PENDING/TRANSFERRING (sender), or a status indicator for terminal states. A small send button in the Files tab header (hidden, not disabled, when not connected) opens the multi-file picker. Progress bars update during TRANSFERRING. Empty state reflects the connection state. The list clears on disconnect.

## Acceptance criteria

- [ ] `FilesTab` Lit component renders the file list, the send button, and the empty state
- [ ] List is sorted newest-first by `createdAt`; rows do not move on state transitions
- [ ] Each `FileRow` shows the direction indicator (↑ for sent, ↓ for received), filename, size, and current state
- [ ] `FileRow` for PENDING (receiver): shows Accept and Reject buttons; Accept is disabled if any file is TRANSFERRING
- [ ] `FileRow` for PENDING (sender): shows Cancel button
- [ ] `FileRow` for QUEUED: shows "Queued" status, no actions
- [ ] `FileRow` for TRANSFERRING: shows progress bar (`(bytesSent / totalBytes) * 100%` for sender, `(bytesReceived / totalBytes) * 100%` for receiver) and a Cancel button
- [ ] `FileRow` for COMPLETED: shows a checkmark; no Download button (file is already on disk or has been saved)
- [ ] `FileRow` for REJECTED / FAILED / CANCELLED: shows the status and a small "Dismiss" icon
- [ ] Send button in the Files tab header opens a multi-file picker; hidden (not displayed) when not connected
- [ ] Empty state: connected with no files shows "Tap + to send your first file"; not connected shows "Connect a device to start sharing files" (Files tab itself is disabled in this case)
- [ ] When the connection leaves CONNECTED, `FileRegistry.clear()` is called and the list is empty
- [ ] The Connection tab's old "Send test file" button is removed
- [ ] E2E test: A and B connect; A picks 3 files; all 3 appear in B's Files tab as PENDING with Accept/Reject; B accepts file 2; file 2 shows progress and completes; file 1 and 3 are still PENDING with Accept buttons now enabled; B accepts file 1; transfers; A cancels file 3; file 3 disappears from B
- [ ] E2E test: progress bars update on both sides during transfer; sender's bar shows bytes sent, receiver's shows bytes received; they converge at 100% on completion
- [ ] E2E test: A disconnects; both Files tabs are empty
- [ ] Unit test: `FileRow` for each of the 7 states renders the right buttons and progress bar; direction indicator is correct
- [ ] Unit test: `FilesTab` with 5 files in the registry renders 5 rows in the right order; empty registry renders the empty state
- [ ] All previously passing tests still pass

## Blocked by

- 00014 (file state machine + batch offer)

## User stories covered

- PRD-0009 stories 1-15
- PRD-0008 stories on tab visibility and disabled state
