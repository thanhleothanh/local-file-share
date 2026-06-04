# Issue 00010 — Per-Chunk ACK + ChunkCache

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (ChunkCache and AckHandler).

## What to build

The receiver sends a `CHUNK_ACK` on the control channel for every chunk it receives. The sender maintains a `ChunkCache: Map<fileId, Map<index, ArrayBuffer>>` and deletes each chunk from the cache when its ACK arrives. This bounds the cache size by `throughput × RTT` rather than file size, making multi-gigabyte transfers feasible. The receiver-side ACK emission is added to the existing `FileReceiver`. The sender-side cache management is added to the existing `FileSender`.

## Acceptance criteria

- [ ] `ChunkCache` interface: `add(fileId, index, data)`, `get(fileId, index): data | null`, `delete(fileId, index)`, `deleteFile(fileId)`
- [ ] Internally: `Map<fileId, Map<index, ArrayBuffer>>`
- [ ] `FileSender` calls `cache.add(fileId, index, data)` after each chunk is sent
- [ ] `FileSender` handles incoming `CHUNK_ACK` messages by calling `cache.delete(fileId, index)`
- [ ] `FileReceiver` emits `CHUNK_ACK` on the control channel for every chunk decoded from the data channel
- [ ] On file COMPLETED or FAILED, the sender calls `cache.deleteFile(fileId)` to free memory
- [ ] Unit test: `ChunkCache` with 1000 adds and 1000 deletes ends empty; `deleteFile` removes the whole file
- [ ] Unit test: `AckHandler.handle({type: 'CHUNK_ACK', fileId, index: 5}, cache)` with a cache containing 10 chunks leaves the cache with 9; handling an ACK for an unknown index is a no-op
- [ ] Unit test: `FileSender` given a 1 MB file and a mock data channel that ACKs each chunk: cache is empty after the transfer (all chunks evicted on ACK)
- [ ] Unit test: `FileSender` given a 1 MB file and a mock data channel that never ACKs: cache contains all 64 chunks after the transfer
- [ ] Stress test: send 1 GB through a mock data channel that ACKs each chunk; the cache size never exceeds 100 chunks at any point during the transfer (verified by sampling)
- [ ] All previously passing tests still pass

## Blocked by

- 0009 (SCTP backpressure is in place; sender pacing is the right context to add cache management)

## User stories covered

- PRD-0006 stories 2-3
