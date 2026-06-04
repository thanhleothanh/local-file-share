# Issue 00011 — NACK Retransmit + ChunkBuffer + FileIntegrityChecker

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (ChunkBuffer, NackHandler, FileIntegrityChecker).

## What to build

After the sender sends `TRANSFER_DONE`, the receiver performs an integrity check: it knows the total chunk count from the `FILE_OFFER` payload, compares against what it has, and if any indices are missing, sends a `CHUNK_REQUEST_NACK` with the missing indices. The sender re-sends the requested chunks from the un-ACKed entries in its `ChunkCache`. After `MAX_NACK_ROUNDS = 3`, the file is marked FAILED. This slice is the core reliability story — drops, reordering, and reconnection all funnel through here.

## Acceptance criteria

- [ ] `ChunkBuffer` interface: `add(fileId, index, data, isLast)`, `hasAllIndices(fileId, totalChunks): boolean`, `missingIndices(fileId, totalChunks): number[]`, `assemble(fileId): ArrayBuffer`, `deleteFile(fileId)`
- [ ] `FileIntegrityChecker.check(fileId, totalChunks, buffer)` returns `{complete: boolean, missingIndices: number[]}`
- [ ] `NackHandler.handle({type: 'CHUNK_REQUEST_NACK', fileId, missingIndices}, sender, cache, round)` re-sends the requested chunks from the cache
- [ ] When the receiver detects missing indices, it sends `CHUNK_REQUEST_NACK` with the right indices
- [ ] The sender re-sends from the cache; the new chunks are ACKed and evicted as before
- [ ] `MAX_NACK_ROUNDS = 3`; after the receiver sends 3 NACKs without resolution, the file is marked FAILED on both sides
- [ ] When the sender receives a NACK and the cache does not have a requested chunk (e.g., it was already evicted), the sender sends `CHUNK_REQUEST_FAILED` on the control channel and the file is marked FAILED on both sides
- [ ] Unit test: `ChunkBuffer.add` then `hasAllIndices` returns false until the last index, then true; `missingIndices` returns the correct gaps after partial writes; `assemble` concatenates in order
- [ ] Unit test: `FileIntegrityChecker` given total chunks = 100 and buffer with all 100 indices returns `{complete: true}`; given 95 indices returns `{complete: false, missingIndices: [3, 7, 42]}`
- [ ] Unit test: `NackHandler` given a cache with chunks for indices [3, 7, 42] handles a NACK for those indices by retransmitting them via the mock data channel sender
- [ ] Unit test: drop-simulation test — sender sends 100 chunks, receiver drops 5, receiver sends NACK, sender retransmits from cache, file completes
- [ ] Unit test: 3-rounds-exhausted test — sender's cache is empty when the NACK arrives; file is marked FAILED on both sides
- [ ] All previously passing tests still pass

## Blocked by

- 00010 (per-chunk ACK and ChunkCache exist; NACK is built on top)

## User stories covered

- PRD-0006 stories 4-6
