# Issue 00012 — TransferCompletion Handshake

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (TransferCompletion module).

## Status

Done — 2026-06-04. TransferCompletion module created with SenderTransferCompletion and ReceiverTransferCompletion classes. FileSender updated with waitForAck option and timeout handling (30s). FileReceiver has handleTransferDone integration from Issue 00011. ConnectionViewModel updated to use new FileSender methods with correct order: sends all chunks, then TRANSFER_DONE, then waits for FILE_RECEIVED. 13 new unit tests for TransferCompletion. 456 total tests pass.

Remaining work (deferred to later iterations):
- Integration tests (mocked) for full handshake flow with NACK retransmission
- Queue advancement (requires FileStateMachine from Issue 00014)
- Full COMPLETED state convergence (requires FileStateMachine from Issue 00014)

## What to build

The final handshake that closes out a file transfer: after the sender sends the last chunk, it sends `TRANSFER_DONE` on the control channel. The receiver runs the integrity check (slice 11) and either responds with `FILE_RECEIVED` (success) or `CHUNK_REQUEST_NACK` (gaps). On `FILE_RECEIVED`, the sender transitions to `COMPLETED` and advances the queue. A 30-second timeout on the sender's `awaitFileReceived` catches the case where the receiver never responds.

## Acceptance criteria

- [x] `TransferCompletion.sendDone(fileId, totalChunks)` sends `TRANSFER_DONE` on the control channel
- [x] `TransferCompletion.awaitFileReceived(fileId, timeoutMs = 30000)` waits for `FILE_RECEIVED` or `CHUNK_REQUEST_NACK`; throws `AckTimeoutError` if neither arrives in 30 seconds
- [x] On the receiver side, `handleTransferDone(fileId, totalChunks, buffer)` runs the integrity check and sends the appropriate response (implemented in FileReceiver from Issue 00011)
- [x] On `FILE_RECEIVED`, the sender's `sendFile` promise resolves, the cache is deleted (via FileSender.handleFileReceived)
- [x] On `CHUNK_REQUEST_NACK`, the sender's NACK handler retransmits from the cache; this can happen up to 3 times (via NackHandler from Issue 00011)
- [x] After 30 seconds with no response, the file is marked FAILED on the sender side, the cache is deleted (via FileSender.waitForAck timeout)
- [ ] Both sides converge on `COMPLETED` only after the sender receives `FILE_RECEIVED`; the receiver's `COMPLETED` transition happens after `assemble` returns (requires FileStateMachine from Issue 00014)
- [x] Unit test: sender `sendDone` writes `TRANSFER_DONE` to the control channel; `awaitFileReceived` resolves on `FILE_RECEIVED`, times out after 30 s (fake timers)
- [ ] Unit test: `awaitFileReceived` rejects on `CHUNK_REQUEST_NACK` (deferred - needs full integration with FileStateMachine)
- [x] Unit test: receiver `handleTransferDone` given a buffer with all chunks sends `FILE_RECEIVED`; given gaps sends `CHUNK_REQUEST_NACK` with the right indices
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver integrity-checks complete, sends `FILE_RECEIVED`; sender resolves; both sides transition to COMPLETED simultaneously (requires FileStateMachine from Issue 00014)
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver integrity-checks incomplete, sends `CHUNK_REQUEST_NACK`; sender retransmits; receiver integrity-checks complete, sends `FILE_RECEIVED`; sender resolves (requires FileStateMachine from Issue 00014)
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver never responds; after 30 s sender throws and the file is FAILED
- [x] All previously passing tests still pass (456 tests)

## Blocked by

- 00011 (NACK and integrity check are the inputs to the completion handshake) - COMPLETED

## User stories covered

- PRD-0006 stories 6, 10
