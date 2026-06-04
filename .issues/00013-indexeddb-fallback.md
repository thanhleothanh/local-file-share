# Issue 00013 — IndexedDB Fallback

## Parent

Derived from `.docs/prds/0002-storage-backends.md` (IndexedDBWriter and DownloadLauncher portions) and `.docs/prds/0006-file-transfer-protocol.md` (fallback chunk buffering).

## What to build

Implement the IndexedDB storage path for browsers without File System Access API (Safari, iOS, Firefox). `IndexedDBWriter` buffers chunks in IndexedDB during transfer; `DownloadLauncher.assembleAndSave` reads chunks back in batches of 100, concatenates into a Blob, and triggers the browser's save dialog on completion. The 1 GB total queue cap is enforced. `StorageBackendFactory` chooses the backend at startup based on `'showSaveFilePicker' in window`.

## Acceptance criteria

- [ ] `IndexedDBWriter` opens a database named `LocalFileShare-{connId}` with two object stores: `files` (key: `fileId`, value: metadata) and `chunks` (key: `${fileId}__${index}`, value: chunk data)
- [ ] `writeChunk` opens a transaction, writes the chunk row; `cancel` deletes the file and all its chunks
- [ ] `DownloadLauncher.assembleAndSave(fileId)` reads chunks in batches of 100, concatenates into a `Blob`, calls `saveBlob(blob, filename)` which creates an object URL, triggers a click on an anchor, and revokes the URL
- [ ] `StorageBackendFactory.detect()` returns `new FileSystemAccessWriter()` if `showSaveFilePicker` is in `window`, else `new IndexedDBWriter()`; the result is cached for the session
- [ ] The factory exposes a `kind(): 'fsa' | 'indexeddb'` accessor; the queue manager uses this to enforce the right cap (100 files for FSA, 1 GB for IndexedDB)
- [ ] On completion of a file in IndexedDB mode, the save dialog is triggered automatically (no "Download" button)
- [ ] Unit test (Vitest + fake-indexeddb): write 10 chunks, read them back, assert round-trip; `cancel` deletes the chunks; concurrent writes to different files do not interleave
- [ ] Unit test: `DownloadLauncher` given a set of 250 mock chunks reads 100 at a time and the final Blob has the correct size; the anchor click was triggered with a valid object URL
- [ ] Unit test: `StorageBackendFactory` with a mocked `window.showSaveFilePicker` present returns the FSA writer; absent returns the IndexedDB writer; the decision is stable across calls
- [ ] E2E test (Playwright with a Safari-shaped UA, or with `showSaveFilePicker` removed via `delete window.showSaveFilePicker`): A and B connect; A sends a 1 MB file; B buffers chunks in IndexedDB; on completion, B sees a save dialog (intercepted via Playwright's download API); the downloaded file matches the source
- [ ] E2E test: the queue cap of 1 GB is enforced; sending files totaling > 1 GB is rejected with a toast
- [ ] All previously passing tests still pass

## Blocked by

- 0008 (FSA storage works; IndexedDB is the parallel path)

## User stories covered

- PRD-0002 stories 2, 4, 6, 8
- PRD-0006 story on fallback chunk buffering
