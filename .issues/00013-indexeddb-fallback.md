# Issue 00013 — IndexedDB Fallback

## Parent

Derived from `.docs/prds/0002-storage-backends.md` (IndexedDBWriter and DownloadLauncher portions) and `.docs/prds/0006-file-transfer-protocol.md` (fallback chunk buffering).

## Status

Done — 2026-06-04. IndexedDBWriter, BrowserDownloadLauncher, and StorageBackendFactory modules implemented with full queue cap enforcement. fake-indexeddb package installed with comprehensive unit tests (39 tests total). Queue cap enforcement implemented via ConnectionViewModel.canAddFiles() using StorageBackendFactory.detect(). StorageBackendFactory.getWriter() now properly creates both FSA and IndexedDB writers. 416 total tests pass.

## What to build

Implement the IndexedDB storage path for browsers without File System Access API (Safari, iOS, Firefox). `IndexedDBWriter` buffers chunks in IndexedDB during transfer; `DownloadLauncher.assembleAndSave` reads chunks back in batches of 100, concatenates into a Blob, and triggers the browser's save dialog on completion. The 1 GB total queue cap is enforced. `StorageBackendFactory` chooses the backend at startup based on `'showSaveFilePicker' in window`.

## Progress

Implemented:
- `IndexedDBWriter` with database opening, object stores (files and chunks), startFile, writeChunk, cancel, finalize, getFileChunks, getFileMetadata, clear methods
- `BrowserDownloadLauncher` with assembleAndSave (full implementation with batch reading), assembleFile (batch processing of 100 chunks), and saveBlob (browser download trigger)
- `StorageBackendFactory` singleton with static detect(), instance detect(), kind(), getWriter(), initialize(), reset() methods; lazy detection on first access
- Fixed StorageBackendFactory.getWriter() to properly create FileSystemAccessWriter for FSA and IndexedDBWriter for IndexedDB
- Updated ConnectionViewModel to use StorageBackendFactory.detect() instead of duplicate detectStorageBackend() method
- Integration with existing FileSystemWriter interface
- Exports added to packages/client/src/files/index.ts
- Comprehensive unit tests for IndexedDBWriter, BrowserDownloadLauncher, and StorageBackendFactory using fake-indexeddb
- Installed fake-indexeddb package for realistic IndexedDB testing

## Acceptance criteria

- [x] `IndexedDBWriter` opens a database named `LocalFileShare-{connId}` with two object stores: `files` (key: `fileId`, value: metadata) and `chunks` (key: `${fileId}__${index}`, value: chunk data)
- [x] `writeChunk` opens a transaction, writes the chunk row; `cancel` deletes the file and all its chunks
- [x] `DownloadLauncher.assembleAndSave(fileId, fileName, writer)` reads chunks in batches of 100, concatenates into a `Blob`, calls `saveBlob(blob, filename)` which creates an object URL, triggers a click on an anchor, and revokes the URL
- [x] `StorageBackendFactory.detect()` returns `'fsa'` or `'indexeddb'` based on `window` checks; result is cached for the session
- [x] The factory exposes a `kind(): 'fsa' | 'indexeddb'` accessor; lazy detection on first access
- [x] The queue manager uses backend detection to enforce the right cap (100 files for FSA, 1 GB for IndexedDB) via ConnectionViewModel.canAddFiles() check
- [x] On completion of a file in IndexedDB mode, the save dialog is triggered automatically via `finalize()` → `assembleAndSave()`
- [x] Unit test: StorageBackendFactory with mocked `window.showSaveFilePicker` present returns kind 'fsa'; absent returns 'indexeddb'; the decision is stable across calls
- [x] Unit test: BrowserDownloadLauncher given a set of 250 mock chunks reads 100 at a time and the final Blob has the correct size
- [x] Unit test: BrowserDownloadLauncher.saveBlob creates object URL, triggers download, and revokes URL
- [x] Unit test (Vitest + fake-indexeddb): write and read chunks round-trip
- [x] Unit test (Vitest + fake-indexeddb): cancel deletes all chunks for a file
- [x] Unit test (Vitest + fake-indexeddb): concurrent writes to different files do not interleave
- [x] Unit test (Vitest + fake-indexeddb): getFileMetadata returns stored metadata
- [x] Unit test (Vitest + fake-indexeddb): clear removes all file data
- [x] Unit test (Vitest + fake-indexeddb): getDatabaseName returns correct name
- [x] Unit test: StorageBackendFactory.getWriter() returns FileSystemAccessWriter for FSA and IndexedDBWriter for IndexedDB
- [x] Unit test: StorageBackendFactory.static detect() returns correct backend without initialization
- [ ] E2E test (Playwright with a Safari-shaped UA, or with `showSaveFilePicker` removed via `delete window.showSaveFilePicker`): A and B connect; A sends a 1 MB file; B buffers chunks in IndexedDB; on completion, B sees a save dialog (intercepted via Playwright's download API); the downloaded file matches the source (blocked: Playwright not installable on ubuntu26.04-x64)
- [ ] E2E test: the queue cap of 1 GB is enforced; sending files totaling > 1 GB is rejected with a toast (blocked: Playwright not installable on ubuntu26.04-x64)
- [x] All previously passing tests still pass (416 tests)

## Blocked by

- E2E tests require Playwright configuration and test setup (Playwright not installable on ubuntu26.04-x64)

## User stories covered

- PRD-0002 stories 2, 4, 6, 8
- PRD-0006 story on fallback chunk buffering

## Next steps

1. Add E2E tests for IndexedDB fallback path (blocked: Playwright not installable on ubuntu26.04-x64)
