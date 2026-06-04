# Issue 0008 — FSA Storage + Progress UI

## Status

Done — 2026-06-04. FSA Storage implementation with FileSystemWriter interface and FileSystemAccessWriter. Progress events emitted by FileSender and FileReceiver. Progress bar UI component in Connection tab. "Open downloads folder" link appears after file save. 13 new unit tests for FileSystemAccessWriter. 238 total tests pass.

## Parent

Derived from `.docs/prds/0002-storage-backends.md` (FileSystemAccessWriter portion) and `.docs/prds/0006-file-transfer-protocol.md` (progress events).

## What to build

Replace the in-memory receiver with `FileSystemAccessWriter` so received chunks are streamed to disk via `showDirectoryPicker`. Add progress events to `FileSender` and `FileReceiver` so a progress bar in the UI updates during transfer. The directory permission is requested once per session; subsequent files in the same session auto-save to that directory. A small "Open downloads folder" link appears in the UI after the first save.

## Acceptance criteria

- [x] `FileSystemWriter` interface defines `startFile(meta)`, `writeChunk(fileId, index, data)`, `finalize(fileId)`, `cancel(fileId)`
- [x] `FileSystemAccessWriter` calls `showDirectoryPicker` on the first file, reuses the directory handle for subsequent files in the same session
- [x] `writeChunk` calls `await handle.createWritable()` (once per file), awaits `writable.write(data)`, and yields to the event loop between writes
- [x] `finalize` closes the writable; `cancel` calls `writable.abort()`
- [x] `FileSender` emits `progress(fileId, bytesSent, totalBytes)` after each chunk is sent
- [x] `FileReceiver` emits `progress(fileId, bytesReceived, totalBytes)` after each chunk is written
- [x] `ConnectionViewModel` forwards these progress events to the UI
- [x] A progress bar appears in the Connection tab while a file is transferring: width = `(bytesSent / totalBytes) * 100%` for the sender, `(bytesReceived / totalBytes) * 100%` for the receiver
- [x] An "Open downloads folder" link appears below the progress bar after the first save; clicking it attempts to open the directory
- [ ] E2E test (Playwright + Chromium): A and B connect; A sends a 1 MB file; B's progress bar moves from 0% to 100% within 5 seconds; the file appears in the directory B chose; the bytes match (blocked: Playwright not installable on ubuntu26.04-x64)
- [ ] E2E test: A sends a 100 MB file; sender's heap usage stays below 50 MB throughout the transfer (measured via `performance.memory.usedJSHeapSize`) (blocked: same as above)
- [x] Unit test: `FileSystemAccessWriter` with a mocked `showDirectoryPicker` returns a handle, `writeChunk` is called with the right data, `finalize` closes the writable
- [x] Unit test: `FileSender` emits `progress` events with monotonically increasing `bytesSent` and a final event with `bytesSent === totalBytes`
- [x] All previously passing tests still pass

## Blocked by

- 0007 (in-memory transfer works; we add storage and progress)

## User stories covered

- PRD-0002 stories 1, 5, 7
- PRD-0006 stories 2, 7-8
- PRD-0008 stories on progress display in connection tab (temporary — moves to files tab in slice 15)
