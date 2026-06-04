# Issue 00013 — IndexedDB Fallback

## Parent

Derived from `.docs/prds/0002-storage-backends.md` (IndexedDBWriter and DownloadLauncher portions) and `.docs/prds/0006-file-transfer-protocol.md` (fallback chunk buffering).

## Status

In Progress — 2026-06-04. IndexedDBWriter, BrowserDownloadLauncher, and StorageBackendFactory modules created. Basic unit tests added (32 tests). 377 total tests pass.

## What to build

Implement the IndexedDB storage path for browsers without File System Access API (Safari, iOS, Firefox). `IndexedDBWriter` buffers chunks in IndexedDB during transfer; `DownloadLauncher.assembleAndSave` reads chunks back in batches of 100, concatenates into a Blob, and triggers the browser's save dialog on completion. The 1 GB total queue cap is enforced. `StorageBackendFactory` chooses the backend at startup based on `'showSaveFilePicker' in window`.

## Progress

Implemented:
- `IndexedDBWriter` with database opening, object stores (files and chunks), startFile, writeChunk, cancel, finalize, getFileChunks, getFileMetadata, clear methods
- `BrowserDownloadLauncher` with assembleAndSave (full implementation with batch reading), assembleFile (batch processing of 100 chunks), and saveBlob (browser download trigger)
- `StorageBackendFactory` singleton with detect, kind, getWriter, initialize, reset methods; lazy detection on first access
- Integration with existing FileSystemWriter interface
- Exports added to packages/client/src/files/index.ts
- Unit tests for IndexedDBWriter, BrowserDownloadLauncher, and StorageBackendFactory

## Acceptance criteria

- [x] `IndexedDBWriter` opens a database named `LocalFileShare-{connId}` with two object stores: `files` (key: `fileId`, value: metadata) and `chunks` (key: `${fileId}__${index}`, value: chunk data)
- [x] `writeChunk` opens a transaction, writes the chunk row; `cancel` deletes the file and all its chunks
- [x] `DownloadLauncher.assembleAndSave(fileId, fileName, writer)` reads chunks in batches of 100, concatenates into a `Blob`, calls `saveBlob(blob, filename)` which creates an object URL, triggers a click on an anchor, and revokes the URL
- [x] `StorageBackendFactory.detect()` returns `'fsa'` or `'indexeddb'` based on `window` checks; result is cached for the session
- [x] The factory exposes a `kind(): 'fsa' | 'indexeddb'` accessor; lazy detection on first access
- [ ] The queue manager uses `kind()` to enforce the right cap (100 files for FSA, 1 GB for IndexedDB)
- [x] On completion of a file in IndexedDB mode, the save dialog is triggered automatically via `finalize()` → `assembleAndSave()`
- [x] Unit test: StorageBackendFactory with mocked `window.showSaveFilePicker` present returns kind 'fsa'; absent returns 'indexeddb'; the decision is stable across calls
- [x] Unit test: BrowserDownloadLauncher given a set of 250 mock chunks reads 100 at a time and the final Blob has the correct size
- [x] Unit test: BrowserDownloadLauncher.saveBlob creates object URL, triggers download, and revokes URL
- [ ] Unit test (Vitest + fake-indexeddb): write 10 chunks, read them back, assert round-trip; `cancel` deletes the chunks; concurrent writes to different files do not interleave
- [ ] E2E test (Playwright with a Safari-shaped UA, or with `showSaveFilePicker` removed via `delete window.showSaveFilePicker`): A and B connect; A sends a 1 MB file; B buffers chunks in IndexedDB; on completion, B sees a save dialog (intercepted via Playwright's download API); the downloaded file matches the source
- [ ] E2E test: the queue cap of 1 GB is enforced; sending files totaling > 1 GB is rejected with a toast
- [x] All previously passing tests still pass (377 tests)

## Blocked by

- 0008 (FSA storage works; IndexedDB is the parallel path)
- fake-indexeddb package needed for comprehensive IndexedDB unit tests
- E2E tests require Playwright configuration and test setup

## User stories covered

- PRD-0002 stories 2, 4, 6, 8
- PRD-0006 story on fallback chunk buffering

## Next steps

1. Install fake-indexeddb and add comprehensive IndexedDB unit tests with actual database operations
2. Implement queue cap enforcement using the factory's kind() method
3. Add E2E tests for IndexedDB fallback path
4. Integrate with FileStateMachine (Issue 00014) for state management
