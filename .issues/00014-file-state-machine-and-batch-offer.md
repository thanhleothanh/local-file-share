# Issue 00014 — File State Machine + Batch Offer

## Parent

Derived from `.docs/prds/0007-state-machines-queue-and-lifecycle.md` (FileStateMachine, FileQueue, FileRegistry) and `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (control flow portion).

## Status

Done — 2026-06-04. FileStateMachine, FileQueue, and FileRegistry modules created and wired into ConnectionViewModel. Multi-file picker implemented. FILE_OFFER, FILE_ACCEPT, and FILE_REJECT message handling added. Queue advancement implemented - when a file completes, the next QUEUED file starts automatically via FileQueue.startNextFile(). State transitions logged to console. 486 total tests pass.

Remaining work (deferred to Issue 00015 - Files Tab UI):
- Clicking a new "Accept" button on the receiver sends FILE_ACCEPT; the state transitions to QUEUED if any other file is TRANSFERRING, else TRANSFERRING
- While a file is TRANSFERRING, all other "Accept" buttons are disabled
- The sender can cancel a PENDING file via a new "Cancel" button; the receiver sees the row disappear
- E2E test: A and B connect; A picks 3 files; all 3 appear PENDING on B; B accepts file 2 first; files 1 and 3 have disabled Accept buttons; file 2 transfers and completes; B accepts file 1; file 1 transfers; A cancels file 3; file 3 disappears from B's list

## What to build

Implement the 7-state file state machine, the send-side FIFO queue, and the in-memory file registry. Wire them into the control flow so a sender can offer multiple files at once (batch offer), all appear as PENDING on the receiver, the receiver accepts one at a time, the queue advances automatically, and the sender can cancel PENDING offers. No UI yet — the existing "Send test file" button is replaced with a multi-file picker that goes through the new flow, and the receiver logs the state transitions to the console. The full Files tab UI is slice 15.

## Progress

Implemented:
- `FileStateMachine` with 7 states (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED) and 7 events (ACCEPT, REJECT, CANCEL, START, COMPLETE, FAIL, DISCONNECT)
- Pure transition function with logging, terminal state checking, and valid transition validation
- `FileQueue` with enqueue, dequeue, peek, remove, size, isEmpty, startNextFile (skips terminal states), getAll, getCurrentFileId, setCurrentFileId, isTransferring
- `FileRegistry` with add, update, get, getAll (sorted by createdAt descending), getByState, getActiveFiles, has, remove, clear, size, transition, getPendingFiles, getQueuedFiles, getTransferringFiles, getStateCounts
- Exports added to packages/client/src/files/index.ts
- Unit tests for all three modules
- FileRegistry and FileQueue instances added to ConnectionViewModel
- sendFiles method sends FILE_OFFER batch message and stores files for later transfer
- FILE_OFFER, FILE_ACCEPT, FILE_REJECT message handlers added to ConnectionViewModel
- Queue advancement: startFileTransfer, advanceQueue, and FILE_RECEIVED handler work together to automatically start next queued file
- Multi-file picker support added to connected-card component
- State transitions logged to console on both sender and receiver sides

## Acceptance criteria

- [x] `FileStateMachine` exposes a transition table with 7 states (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED) and 7 events (ACCEPT, REJECT, CANCEL, START, COMPLETE, FAIL, DISCONNECT); pure transition function
- [x] `FileQueue` exposes `enqueue`, `dequeue`, `peek`, `remove`, `size`, `isEmpty`, `startNextFile`; `startNextFile` skips terminal-state candidates
- [x] `FileRegistry` exposes `add`, `update`, `get`, `getAll`, `clear`; `getAll` sorts by `createdAt` descending
- [x] Unit test: exhaustive transition table for `FileStateMachine` (12 valid transitions + all others return invalid)
- [x] Unit test: `FileQueue.startNextFile` skips a file in `CANCELLED` state
- [x] Unit test: `FileRegistry.getAll` sorts by `createdAt` descending
- [x] The Connection tab's "Send test file" button is replaced with a multi-file `<input type="file" multiple>` picker (via connected-card)
- [x] On send, all picked files are offered at once via `FILE_OFFER` on the control channel; each gets a fresh `fileId` and is added to the sender's `FileRegistry` with state PENDING
- [x] The receiver logs the receipt of each offer: `console.info('[FileState] received offer', {fileId, name, size})` and adds the file to its `FileRegistry` with state PENDING
- [ ] Clicking a new "Accept" button (or test helper) on the receiver sends `FILE_ACCEPT`; the state transitions to QUEUED if any other file is TRANSFERRING, else TRANSFERRING (requires Files tab UI from Issue 00015)
- [ ] While a file is TRANSFERRING, all other "Accept" buttons are disabled (requires Files tab UI from Issue 00015)
- [x] When a file completes, the next QUEUED file starts automatically (`FileQueue.startNextFile`) - implemented via startFileTransfer, advanceQueue, and FILE_RECEIVED handler
- [ ] The sender can cancel a PENDING file via a new "Cancel" button; the receiver sees the row disappear (requires Files tab UI from Issue 00015)
- [x] Both sides log every state transition: `console.info('[FileState] {fileId}: {oldState} → {newState} ({event})')`
- [ ] E2E test: A and B connect; A picks 3 files; all 3 appear PENDING on B; B accepts file 2 first; files 1 and 3 have disabled Accept buttons; file 2 transfers and completes; B accepts file 1; file 1 transfers; A cancels file 3; file 3 disappears from B's list (requires Files tab UI from Issue 00015)
- [x] All previously passing tests still pass (456 tests)

## Blocked by

- 00012 (TransferCompletion handshake makes the protocol work end-to-end for a single file; we add the queue on top)

## User stories covered

- PRD-0007 stories 3-4, 6-7, 9-10
- PRD-0009 stories 4-6, 9 (UI comes in slice 15)

## Next steps

1. ~~Wire FileStateMachine, FileQueue, and FileRegistry into the control flow~~ (Done)
2. ~~Replace "Send test file" button with multi-file picker~~ (Done)
3. ~~Implement FILE_OFFER and FILE_ACCEPT message handling~~ (Done)
4. ~~Implement queue advancement on file completion~~ (Done - via startFileTransfer, advanceQueue, FILE_RECEIVED handler)
5. Add E2E tests for batch offer and queue management (requires Files tab UI from Issue 00015)
6. ~~Integrate with TransferCompletion (Issue 00012) for full COMPLETED state convergence~~ (Done)
