# Issue 00010 — Per-Chunk ACK + ChunkCache

## Status

Done — 2026-06-04. ChunkCache implementation with DefaultChunkCache class (Map<fileId, Map<index, ArrayBuffer>>). AckHandler implementation for handling CHUNK_ACK messages. FileSender integrates with cache to add chunks after sending and delete on ACK via handleChunkAck. FileReceiver emits CHUNK_ACK on control channel for every chunk received via sendChunkAck callback. ConnectionViewModel wires up the ACK sending and handling. Additional methods on FileSender: deleteFile to free memory. 29 new unit tests added (13 for ChunkCache, 11 for AckHandler, 5 for FileSender cache integration). 289 total tests pass.

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (ChunkCache and AckHandler).

## What to build

The receiver sends a `CHUNK_ACK` on the control channel for every chunk it receives. The sender maintains a `ChunkCache: Map<fileId, Map<index, ArrayBuffer>>` and deletes each chunk from the cache when its ACK arrives. This bounds the cache size by `throughput × RTT` rather than file size, making multi-gigabyte transfers feasible. The receiver-side ACK emission is added to the existing `FileReceiver`. The sender-side cache management is added to the existing `FileSender`.

## Acceptance criteria

- [x] `ChunkCache` interface: `add(fileId, index, data)`, `get(fileId, index): data | null`, `delete(fileId, index)`, `deleteFile(fileId)`
- [x] Internally: `Map<fileId, Map<index, ArrayBuffer>>`
- [x] `FileSender` calls `cache.add(fileId, index, data)` after each chunk is sent
- [x] `FileSender` handles incoming `CHUNK_ACK` messages by calling `cache.delete(fileId, index)`
- [x] `FileReceiver` emits `CHUNK_ACK` on the control channel for every chunk decoded from the data channel
- [x] On file COMPLETED or FAILED, the sender calls `cache.deleteFile(fileId)` to free memory
- [x] Unit test: `ChunkCache` with 1000 adds and 1000 deletes ends empty; `deleteFile` removes the whole file
- [x] Unit test: `AckHandler.handle({type: 'CHUNK_ACK', fileId, index: 5}, cache)` with a cache containing 10 chunks leaves the cache with 9; handling an ACK for an unknown index is a no-op
- [x] Unit test: `FileSender` given a 1 MB file and a mock data channel that ACKs each chunk: cache is empty after the transfer (all chunks evicted on ACK)
- [x] Unit test: `FileSender` given a 1 MB file and a mock data channel that never ACKs: cache contains all 64 chunks after the transfer
- [ ] Stress test: send 1 GB through a mock data channel that ACKs each chunk; the cache size never exceeds 100 chunks at any point during the transfer (verified by sampling) (deferred)
- [x] All previously passing tests still pass

## Blocked by

- 0009 (SCTP backpressure is in place; sender pacing is the right context to add cache management)

## User stories covered

- PRD-0006 stories 2-3
