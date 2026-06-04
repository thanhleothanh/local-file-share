# PRD 0006 — File Transfer Protocol

## Problem Statement

Once a WebRTC connection is established, the two devices must be able to send and receive files of any size, reliably, with bounded memory usage, and with honest progress reporting on both sides. The protocol must handle chunking, per-chunk acknowledgment, retransmission of lost chunks via NACK, integrity checking, and a final completion handshake. Without a clean module decomposition, the chunk bookkeeping leaks into UI code and the protocol invariants (e.g., ACK before evict from cache) get violated as the code grows.

## Solution

A set of small, single-responsibility modules that together implement the file transfer protocol. `FileSender` reads the file and emits chunks; `FileReceiver` accepts chunks into a buffer. `ChunkCache` (sender) and `ChunkBuffer` (receiver) own the per-file chunk bookkeeping. `AckHandler` processes per-chunk ACKs; `NackHandler` handles retransmit. `FileIntegrityChecker` validates that all expected indices are present. `TransferCompletion` runs the `TRANSFER_DONE` / `FILE_RECEIVED` / `CHUNK_REQUEST_NACK` handshake. The two endpoints depend on these abstractions via constructor injection, satisfying Dependency Inversion.

## User Stories

1. As a sender, I want to pick a file and have it stream chunk-by-chunk to the receiver, so that I do not run out of memory.
2. As a receiver, I want chunks to be acknowledged as they arrive, so that the sender can free its cache.
3. As a sender, I want my chunk cache to be bounded by `throughput × RTT`, not by file size, so that I can send multi-gigabyte files.
4. As a receiver, I want missing chunks to be retransmitted via NACK, so that reliability is not dependent on a single wire.
5. As a sender, I want to know the total chunk count up front, so that I can detect and retransmit any losses after `TRANSFER_DONE`.
6. As a receiver, I want to perform an integrity check after all chunks arrive, so that I can report missing indices precisely.
7. As either side, I want the file transfer to be cancelable at any time (fail-fast), so that errors are not papered over.
8. As a sender, I want the transfer to be paced by SCTP backpressure, so that the data channel does not overflow mid-send.
9. As a receiver, I want each chunk to be tagged with `fileId`, `index`, and `isLast` via a fixed-size header, so that parsing is fast and unambiguous.
10. As either side, I want the protocol to converge on `COMPLETED` for both peers simultaneously, so that the UI does not drift.
11. As a sender, I want to send multiple files back-to-back without renegotiating the data channel, so that batch transfers are fast.
12. As a developer, I want the protocol to be implementation-agnostic (pure data and methods), so that it is testable without a real WebRTC connection.

## Implementation Decisions

### Module: `FileSender`
- Constructor takes: a `DataChannelSender` (data channel), a `DataChannelSender` (control channel), a `FileSystemWriter` (storage), a `ChunkCache`, a `TransferCompletion`
- `sendFile(file: File, meta: {fileId, name, size, mime}): Promise<void>` — opens the file for reading, loops over chunks: encode header + data, await `dataChannel.send`, write to cache, await `controlChannel.send(CHUNK_ACK...)` indirectly via the cache's eviction. After the last chunk, send `TRANSFER_DONE` on control and await `FILE_RECEIVED`.
- Single responsibility: drive the send loop. Does not parse ACKs (that's `AckHandler`) or manage the cache (that's `ChunkCache`).

### Module: `FileReceiver`
- Constructor takes: a `DataChannelReceiver` (data channel), a `DataChannelReceiver` (control channel), a `FileSystemWriter` (storage), a `ChunkBuffer`, a `TransferCompletion`
- `receiveFile(fileId: string): Promise<void>` — starts accepting chunks, writes them to storage as they arrive, sends `CHUNK_ACK` on the control channel per chunk. On `isLast: true`, triggers `TransferCompletion.handleTransferDone`.
- Single responsibility: drive the receive loop. Does not parse NACKs (that's `NackHandler`) or buffer chunks (that's `ChunkBuffer`).

### Module: `ChunkCache` (sender)
- `add(fileId, index, data)`, `get(fileId, index): data | null`, `delete(fileId, index)`, `deleteFile(fileId)`
- Internally: `Map<fileId, Map<index, ArrayBuffer>>`
- Single responsibility: per-file chunk cache for NACK retransmit. Memory bounded by un-ACKed chunks, not file size.
- Concurrency: JavaScript is single-threaded, no locks needed.

### Module: `ChunkBuffer` (receiver)
- `add(fileId, index, data, isLast)`, `hasAllIndices(fileId, totalChunks): boolean`, `missingIndices(fileId, totalChunks): number[]`, `assemble(fileId): ArrayBuffer`, `deleteFile(fileId)`
- Internally: `Map<fileId, Map<index, ArrayBuffer>>` plus a set of received indices for fast gap detection
- Single responsibility: per-file chunk storage. Used by `FileIntegrityChecker` to validate completion.

### Module: `AckHandler`
- `handle(message: {type: 'CHUNK_ACK', fileId, index}, cache: ChunkCache): void` — deletes the chunk from the cache
- Pure: takes the cache as a dependency, returns void. Testable in isolation.

### Module: `NackHandler`
- `handle(message: {type: 'CHUNK_REQUEST_NACK', fileId, missingIndices}, sender: FileSender, cache: ChunkCache, round: number): void` — looks up the requested chunks in the cache, sends them via the data channel, increments the round counter
- `MAX_NACK_ROUNDS = 3` — after 3 rounds, the receiver gives up and marks the file FAILED

### Module: `FileIntegrityChecker`
- `check(fileId: string, totalChunks: number, buffer: ChunkBuffer): {complete: boolean, missingIndices: number[]}` — compares expected indices (0..totalChunks-1) against the received set
- Pure function. Single responsibility: tell the caller whether all chunks are present.

### Module: `TransferCompletion`
- Sender side: `sendDone(fileId, totalChunks)`, `awaitFileReceived(fileId, timeoutMs = 30000): Promise<void>` — sends `TRANSFER_DONE` and waits for `FILE_RECEIVED` or `CHUNK_REQUEST_NACK` (which triggers NACK handling). If neither arrives in 30s, throws and the file is marked FAILED.
- Receiver side: `handleTransferDone(fileId, totalChunks, buffer)`, `sendFileReceived(fileId)` or `sendNack(fileId, missingIndices)`, `awaitNextRound(fileId, timeoutMs = 30000): Promise<void>` — runs the integrity check, sends the appropriate response. On `FILE_RECEIVED`, the sender's loop completes; on `CHUNK_REQUEST_NACK`, the sender retransmits from cache.
- Single responsibility: the final handshake. State-machine-y but confined to one module.

### Protocol invariants
- Sender never evicts a chunk from the cache before receiving its ACK
- Receiver never sends `FILE_RECEIVED` until `FileIntegrityChecker.check` returns `complete: true`
- After `MAX_NACK_ROUNDS` (3), the file is marked FAILED on both sides
- Both sides converge on `COMPLETED` only after the sender receives `FILE_RECEIVED` and the receiver's assembly step has run

### SOLID application
- **S** — each module has exactly one reason to change: cache storage, buffer storage, ACK handling, NACK handling, integrity check, completion handshake
- **O** — adding a new protocol message (e.g., `FLOW_CONTROL`) adds a new handler; existing modules do not change
- **L** — `ChunkCache` and a future `PersistentChunkCache` would be substitutable
- **I** — `AckHandler` and `NackHandler` depend only on the cache, not on the full `FileSender` API
- **D** — `FileSender` depends on the `DataChannelSender` abstraction, not on `RTCDataChannel`

## Testing Decisions

### What makes a good test
- Mock the data channel and storage writer; test the protocol logic in isolation
- Test the cache and buffer as pure data structures with no I/O
- Use synthetic sequences: send 100 chunks, ack 95, then NACK the 5 missing, verify retransmit and final integrity
- Test the timeout behavior with `vi.useFakeTimers()`

### Modules to test
- `ChunkCache` — `add` then `get` returns the data; `delete` removes it; `deleteFile` removes the whole file. After 1000 adds and 1000 deletes, the cache is empty.
- `ChunkBuffer` — `add` then `hasAllIndices` returns false until the last index, then true. `missingIndices` returns the correct gaps after partial writes. `assemble` concatenates in order.
- `AckHandler` — given a cache with 10 chunks, handling ACK for index 5 leaves the cache with 9. Handling ACK for an unknown index is a no-op.
- `NackHandler` — given a cache with chunks 3, 7, 42 missing, handling a NACK for those indices retransmits them via the mocked data channel sender.
- `FileIntegrityChecker` — given total chunks = 100 and buffer with all 100 indices, returns `{complete: true}`. Given 95 indices, returns `{complete: false, missingIndices: [3, 7, 42]}`.
- `TransferCompletion` (sender) — given a mock control channel, `sendDone` writes `TRANSFER_DONE`. `awaitFileReceived` resolves on `FILE_RECEIVED`, rejects on `CHUNK_REQUEST_NACK`, and times out after 30s (fake timers).
- `TransferCompletion` (receiver) — given a buffer with all chunks, `handleTransferDone` sends `FILE_RECEIVED`. Given gaps, sends `CHUNK_REQUEST_NACK` with the right indices.
- `FileSender` (integration) — given a 1 MB file, 16 KB chunks, and a mock data channel, send produces 64 chunks in order, writes each to the cache, and awaits backpressure. After the last chunk, `TRANSFER_DONE` is sent.
- `FileReceiver` (integration) — given 64 incoming chunks, all 64 are written to storage and 64 `CHUNK_ACK`s are sent on the control channel.

### Test framework
- Vitest with `vi.useFakeTimers()` for timeouts
- No real WebRTC or browser APIs — all dependencies are mocked

### Prior art
None. Pattern: each test wires up the minimum mocks (cache, buffer, data channel sender) and asserts one protocol behavior. Integration tests for `FileSender`/`FileReceiver` exercise a full file end-to-end against mocks.

## Out of Scope

- The UI that shows progress (PRD 0009) — progress is reported via events but not rendered
- The file state machine (PRD 0007) — this PRD implements the protocol; the state machine tracks when to call it
- The queue manager (PRD 0007) — `FileSender` handles one file at a time; the queue decides which file to send next
- File System Access API permission flow — assumed to be handled by the storage writer (PRD 0002)
- Batch file offer — the protocol handles one file at a time; the batch offer is a control message, not a data message (handled by the file state machine)

## Further Notes

- `ChunkCache.add` and `ChunkBuffer.add` should be O(1) amortized — the file size has no upper bound, so the per-file map must be efficient
- `TransferCompletion` must handle the case where the connection drops mid-handshake — close the connection, mark the file FAILED, let the queue discard it
- The `MAX_NACK_ROUNDS = 3` cap is hardcoded; if a future use case needs more, it should be a parameter to `TransferCompletion`, not a global constant
- The protocol is intentionally simple — no compression, no encryption (DTLS handles encryption at the transport layer), no parity chunks (a single NACK round is enough for typical LAN packet loss)
