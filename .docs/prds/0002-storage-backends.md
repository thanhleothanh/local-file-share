# PRD 0002 — Storage Backends

## Problem Statement

On the receiving side, chunks of an incoming file must be persisted somewhere before the file is complete. Chromium-based browsers support the File System Access API (`showSaveFilePicker`), which streams directly to disk with no memory ceiling. Safari, iOS, and Firefox do not support it and must fall back to IndexedDB, which has a finite quota. Without a clean storage abstraction, the rest of the file transfer code is forced to branch on browser support, leaking platform concerns into pure data flow logic.

## Solution

Define a small `FileSystemWriter` interface with two implementations: `FileSystemAccessWriter` (primary, streaming to disk) and `IndexedDBWriter` (fallback, buffering chunks in IndexedDB). A `StorageBackendFactory` inspects `'showSaveFilePicker' in window` at session start and returns the appropriate implementation. The rest of the application depends only on the `FileSystemWriter` interface, satisfying Dependency Inversion.

## User Stories

1. As a receiver on Chrome/Edge, I want chunks to stream directly to a folder I pick once, so that I can transfer multi-gigabyte files without hitting any memory limit.
2. As a receiver on Safari/iOS, I want chunks to be buffered in IndexedDB and a save dialog to appear when each file completes, so that I can save files even on browsers without File System Access API.
3. As a developer, I want a `FileSystemWriter` interface so the file transfer code does not care which backend is active.
4. As a receiver on Safari, I want the IndexedDB queue to be capped at 1 GB, so that the browser does not crash or evict my data.
5. As a receiver on Chrome, I want the file save to be implicit (no dialog per file), so that I am not interrupted mid-batch.
6. As a developer, I want the backend selection to happen once at startup, so that mid-session changes are not possible.
7. As a user, I want to grant the downloads directory once per session, so that subsequent files auto-save without prompts.
8. As a developer, I want all IndexedDB databases from previous sessions to be deleted on page load, so that no orphan data accumulates.
9. As a developer, I want both writers to expose the same `writeChunk`, `finalize`, and `cancel` interface, so that switching is invisible to callers.

## Implementation Decisions

### Module: `FileSystemWriter` (interface)
Three methods: `writeChunk(fileId: string, index: number, data: ArrayBuffer): Promise<void>`, `finalize(fileId: string): Promise<void>`, `cancel(fileId: string): Promise<void>`. Open/Closed — adding a new method (e.g., `flush`) requires all implementors to change, so this interface is intentionally minimal.

### Module: `FileSystemAccessWriter` (implementation)
- `startFile(meta: {name, size, mime}): Promise<FileSystemFileHandle>` — calls `showSaveFilePicker({suggestedName, types})` if first file, otherwise reuses the directory handle already granted.
- `writeChunk` — calls `await handle.createWritable()` once per file (or reuses a per-file writable), streams chunk to disk via `writable.write(data)`. Internally awaits `writable.ready` between writes to avoid overwhelming the stream.
- `finalize` — closes the writable, flushes the file to disk.
- `cancel` — aborts the writable via `writable.abort()`.
- Memory: one chunk buffer (~16 KB) at a time, regardless of file size.

### Module: `IndexedDBWriter` (implementation)
- Database name: `LocalFileShare-{connId}` (one DB per connection, cleaned up on disconnect)
- Object stores: `files` (key: fileId, value: file metadata) and `chunks` (key: `${fileId}__${index}`, value: chunk data)
- `startFile` — opens a transaction, writes the file metadata row.
- `writeChunk` — opens a transaction, writes the chunk row. Yields to the event loop between chunks.
- `finalize` — no-op for IndexedDB; the assembly step (PRD 0006) reads chunks back and triggers the save dialog.
- `cancel` — deletes the file and all its chunks via transaction.
- Memory: chunks held in IndexedDB, not in JS heap.

### Module: `StorageBackendFactory`
- `detect(): FileSystemWriter` — synchronous check `if ('showSaveFilePicker' in window) return new FileSystemAccessWriter() else return new IndexedDBWriter()`. The result is cached at module level so the decision is stable for the session.
- Exposes a `kind(): 'fsa' | 'indexeddb'` accessor so the queue manager can apply the right cap (100 files vs. 1 GB).
- Open/Closed — adding a new backend (e.g., OPFS) means adding a new branch here, not changing the interface.

### Module: `DownloadLauncher` (IndexedDB path only)
- `assembleAndSave(fileId: string): Promise<void>` — reads chunks in batches of 100 (per ADR-0005), concatenates into a single `Blob`, calls `saveBlob(blob, filename)` (a thin wrapper that creates an object URL and triggers a click on an anchor).
- On FSA path, this is never called — the file is already on disk.
- Open/Closed — if a new backend is added that needs a different post-processing step, this can stay unchanged (it just won't be called).

### SOLID application
- **S** — each writer has one reason to change: its underlying storage API
- **O** — adding a new backend does not modify the interface or the file transfer code
- **L** — both writers are substitutable behind the `FileSystemWriter` interface
- **I** — the interface is minimal (3 methods); FSA-only concepts like `createWritable` are not leaked
- **D** — file transfer code depends on the abstraction, not the concrete backend

### Storage backend selection
| Backend | Browsers | Queue cap | Save mechanism |
|---|---|---|---|
| File System Access | Chrome, Edge, Brave, Opera | 100 files (count only) | Implicit (streamed to granted directory) |
| IndexedDB | Safari, iOS, Firefox | 1 GB total bytes | Browser save dialog per file on completion |

## Testing Decisions

### What makes a good test
- Test against the interface, not the implementation — every test should pass for both writers
- For IndexedDB, use `fake-indexeddb` in Node to get a real IndexedDB environment
- For FSA, use a mock `FileSystemFileHandle` that records writes to an in-memory buffer
- No testing of the browser's internal `showSaveFilePicker` behavior — only that we call it correctly

### Modules to test
- `FileSystemAccessWriter` — mocked handle: assert `writeChunk` calls `writable.write` with the right data, `finalize` calls `writable.close`, `cancel` calls `writable.abort`. Verify streaming order matches write order.
- `IndexedDBWriter` — real fake-indexeddb: write 10 chunks, read them back, assert round-trip. Verify cancel deletes the chunks. Verify concurrent writes to different files do not interleave (transaction isolation).
- `StorageBackendFactory` — given a mocked `window.showSaveFilePicker` present/absent, assert the right kind is returned. Assert the decision is stable across calls.
- `DownloadLauncher` — given a set of 250 mock chunks, verify batch processing reads 100 at a time and the final Blob has the correct size. Verify the anchor click was triggered with a valid object URL.

### Test framework
- Vitest for all unit tests
- `fake-indexeddb` for IndexedDB tests (the only real dep on this list)
- No E2E in this PRD — UI integration comes in PRD 0009

### Prior art
None. The pattern will be: each writer is tested with a focused fake/mocked handle. The factory is tested with `vi.stubGlobal('window', ...)`.

## Out of Scope

- UI for granting directory access (comes in PRD 0009)
- The actual file transfer logic that calls these writers (PRD 0006)
- Storage quota detection or eviction logic
- Multi-file directory selection

## Further Notes

- `IndexedDBWriter` should be careful with transaction lifetime — long-running transactions stall other tabs. Keep transactions short (one chunk per transaction is acceptable, batched transactions are an optimization).
- The `FileSystemAccessWriter` should reuse the directory handle across multiple files in a batch, only requesting permission once per session.
- All database names follow the `LocalFileShare-{connId}` pattern so they can be enumerated and deleted on page load (PRD 0012).
- The `DownloadLauncher` is the only module that creates object URLs — make sure to revoke them after the save dialog opens, otherwise the URL leaks.
