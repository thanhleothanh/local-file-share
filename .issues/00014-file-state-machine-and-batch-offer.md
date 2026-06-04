# Issue 00014 — File State Machine + Batch Offer

## Parent

Derived from `.docs/prds/0007-state-machines-queue-and-lifecycle.md` (FileStateMachine, FileQueue, FileRegistry) and `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (control flow portion).

## What to build

Implement the 7-state file state machine, the send-side FIFO queue, and the in-memory file registry. Wire them into the control flow so a sender can offer multiple files at once (batch offer), all appear as PENDING on the receiver, the receiver accepts one at a time, the queue advances automatically, and the sender can cancel PENDING offers. No UI yet — the existing "Send test file" button is replaced with a multi-file picker that goes through the new flow, and the receiver logs the state transitions to the console. The full Files tab UI is slice 15.

## Acceptance criteria

- [ ] `FileStateMachine` exposes a transition table with 7 states (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED) and 7 events (ACCEPT, REJECT, CANCEL, START, COMPLETE, FAIL, DISCONNECT); pure transition function
- [ ] `FileQueue` exposes `enqueue`, `dequeue`, `peek`, `remove`, `size`, `isEmpty`, `startNextFile`; `startNextFile` skips terminal-state candidates
- [ ] `FileRegistry` exposes `add`, `update`, `get`, `getAll`, `clear`; `getAll` sorts by `createdAt` descending
- [ ] The Connection tab's "Send test file" button is replaced with a multi-file `<input type="file" multiple>` picker
- [ ] On send, all picked files are offered at once via `FILE_OFFER` on the control channel; each gets a fresh `fileId` and is added to the sender's `FileRegistry` with state PENDING
- [ ] The receiver logs the receipt of each offer: `console.info('[FileState] received offer', {fileId, name, size})` and adds the file to its `FileRegistry` with state PENDING
- [ ] Clicking a new "Accept" button (or test helper) on the receiver sends `FILE_ACCEPT`; the state transitions to QUEUED if any other file is TRANSFERRING, else TRANSFERRING
- [ ] While a file is TRANSFERRING, all other "Accept" buttons are disabled
- [ ] When a file completes, the next QUEUED file starts automatically (`FileQueue.startNextFile`)
- [ ] The sender can cancel a PENDING file via a new "Cancel" button; the receiver sees the row disappear
- [ ] Both sides log every state transition: `console.info('[FileState] {fileId}: {oldState} → {newState} ({event})')`
- [ ] Unit test: exhaustive transition table for `FileStateMachine` (9 valid transitions + all others throw)
- [ ] Unit test: `FileQueue.startNextFile` skips a file in `CANCELLED` state
- [ ] Unit test: `FileRegistry.getAll` sorts by `createdAt` descending
- [ ] E2E test: A and B connect; A picks 3 files; all 3 appear PENDING on B; B accepts file 2 first; files 1 and 3 have disabled Accept buttons; file 2 transfers and completes; B accepts file 1; file 1 transfers; A cancels file 3; file 3 disappears from B's list
- [ ] All previously passing tests still pass

## Blocked by

- 00012 (TransferCompletion handshake makes the protocol work end-to-end for a single file; we add the queue on top)

## User stories covered

- PRD-0007 stories 3-4, 6-7, 9-10
- PRD-0009 stories 4-6, 9 (UI comes in slice 15)
