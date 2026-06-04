# Issue 0007 — Small File In-Memory Transfer

## Parent

Derived from `.docs/prds/0006-file-transfer-protocol.md` (minimal version, in-memory) and `.docs/prds/0001-foundation-and-build-system.md` (ChunkCodec).

## What to build

Send a small (100 KB) file from one device to another and verify the bytes arrive intact, with no persistence yet (in-memory only on the receiver side). This is the first end-to-end test of the file transfer protocol. `ChunkCodec` handles the 41-byte binary header; `FileSender` reads a `File` and emits chunks; a minimal `FileReceiver` accepts chunks and concatenates them in memory. The user can trigger the transfer from the connection tab by clicking a "Send test file" button. A "Send" button on the Connection tab suffices — the full Files tab UI is deferred to slice 15.

## Acceptance criteria

- [ ] `ChunkCodec.encode(fileId, index, isLast, data)` returns a 41+N byte `ArrayBuffer` with the fileId (36 bytes UTF-8), index (4 bytes big-endian Uint32), isLast (1 byte), then data
- [ ] `ChunkCodec.decode(buffer)` returns `{fileId, index, isLast, data}`; throws on buffers < 41 bytes
- [ ] `FileSender.sendFile(file, fileId, sendChunk: (chunk) => Promise<void>)` slices the file into 16 KB chunks, calls `encode` for each, and `await`s `sendChunk` per chunk
- [ ] Minimal `FileReceiver.receiveFile(fileId, onChunk: (chunk) => void)` accumulates chunks in a `Map<fileId, ArrayBuffer[]>` and emits an `assembled` event with the concatenated bytes when `isLast: true` arrives
- [ ] Clicking "Send test file" on the sender picks a file via `<input type="file">`, generates a `fileId`, calls `FileSender.sendFile`, and forwards each chunk to the data channel via `channel.send`
- [ ] On the receiver, each incoming chunk is decoded with `ChunkCodec.decode` and handed to the receiver
- [ ] When the receiver assembles the file, it logs `console.info('[FileReceiver] assembled', {fileId, byteLength})` and shows a toast: "Received: filename (X KB)"
- [ ] E2E test: A and B connect; A sends a 100 KB file; B's console logs the assembled byte length equal to 102400; B's toast says "Received: test.bin (100 KB)"; the assembled bytes match the source file byte-for-byte
- [ ] Unit test: `ChunkCodec.encode` then `decode` is identity for various inputs (empty data, max Uint32 index, isLast true and false)
- [ ] Unit test: `ChunkCodec.decode` throws on a 40-byte buffer
- [ ] Unit test: `FileSender` given a 100 KB file and a recording `sendChunk` mock produces 7 chunks (6 × 16 KB + 1 × 4 KB) with indices 0-6, the last with `isLast: true`
- [ ] Unit test: `FileReceiver` given chunks 0, 1, 2, 3 (out of order) and then 4 with `isLast: true` emits an `assembled` event with all 5 chunks concatenated in order

## Blocked by

- 0006 (data channel roundtrip works)

## User stories covered

- PRD-0006 stories 1, 9, 11-12
- PRD-0001 story on ChunkCodec
