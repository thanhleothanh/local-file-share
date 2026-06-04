# Issue 00012 — TransferCompletion Handshake

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (TransferCompletion module).

## What to build

The final handshake that closes out a file transfer: after the sender sends the last chunk, it sends `TRANSFER_DONE` on the control channel. The receiver runs the integrity check (slice 11) and either responds with `FILE_RECEIVED` (success) or `CHUNK_REQUEST_NACK` (gaps). On `FILE_RECEIVED`, the sender transitions to `COMPLETED` and advances the queue. A 30-second timeout on the sender's `awaitFileReceived` catches the case where the receiver never responds.

## Acceptance criteria

- [ ] `TransferCompletion.sendDone(fileId, totalChunks)` sends `TRANSFER_DONE` on the control channel
- [ ] `TransferCompletion.awaitFileReceived(fileId, timeoutMs = 30000)` waits for `FILE_RECEIVED` or `CHUNK_REQUEST_NACK`; throws `AckTimeoutError` if neither arrives in 30 seconds
- [ ] On the receiver side, `handleTransferDone(fileId, totalChunks, buffer)` runs the integrity check and sends the appropriate response
- [ ] On `FILE_RECEIVED`, the sender's `sendFile` promise resolves, the cache is deleted, and the queue advances
- [ ] On `CHUNK_REQUEST_NACK`, the sender's NACK handler retransmits from the cache; this can happen up to 3 times
- [ ] After 30 seconds with no response, the file is marked FAILED on the sender side, the cache is deleted, and the queue advances
- [ ] Both sides converge on `COMPLETED` only after the sender receives `FILE_RECEIVED`; the receiver's `COMPLETED` transition happens after `assemble` returns
- [ ] Unit test: sender `sendDone` writes `TRANSFER_DONE` to the control channel; `awaitFileReceived` resolves on `FILE_RECEIVED`, rejects on `CHUNK_REQUEST_NACK`, times out after 30 s (fake timers)
- [ ] Unit test: receiver `handleTransferDone` given a buffer with all chunks sends `FILE_RECEIVED`; given gaps sends `CHUNK_REQUEST_NACK` with the right indices
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver integrity-checks complete, sends `FILE_RECEIVED`; sender resolves; both sides transition to COMPLETED simultaneously
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver integrity-checks incomplete, sends `CHUNK_REQUEST_NACK`; sender retransmits; receiver integrity-checks complete, sends `FILE_RECEIVED`; sender resolves
- [ ] Integration test (mocked): sender sends 100 chunks, sends `TRANSFER_DONE`, awaits; receiver never responds; after 30 s sender throws and the file is FAILED
- [ ] All previously passing tests still pass

## Blocked by

- 00011 (NACK and integrity check are the inputs to the completion handshake)

## User stories covered

- PRD-0006 stories 6, 10
