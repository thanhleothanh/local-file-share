# 2. No File Size Limit — Streaming via File System Access API

**Status**: Accepted  
**Date**: 2026-06-03

## Context

Mobile browsers (particularly iOS Safari) have memory limitations that prevent handling very large files. The original 500MB limit was imposed because the entire file was buffered in IndexedDB during transfer, then assembled into a Blob for download. This approach caps file size at available browser storage.

However, modern Chromium browsers provide the **File System Access API** (`showSaveFilePicker`), which allows streaming directly to disk with constant memory usage (~1-2MB buffer). This removes the file size constraint entirely on supported browsers.

## Decision

**No universal file size limit.** The application streams file data directly from sender to receiver without buffering the entire file in memory.

**Storage backend is detected at runtime:**

| Backend | Browsers | Behavior | Queue Limit |
|---------|----------|----------|-------------|
| **File System Access API** | Chrome, Edge, Brave, Opera | Stream to disk, user picks download directory once | No size limit (count-only cap) |
| **IndexedDB fallback** | Safari, iOS, Firefox | Buffer chunks in IndexedDB, assemble Blob on completion | 1GB total |

Detection: `if ('showSaveFilePicker' in window)` at session start.

**Sender side:** Reads file from disk via `File` API → `ReadableStream` → 16KB chunks over WebRTC data channel. Memory usage: one chunk buffer (~16KB).

**Receiver side (File System Access API):** Chunks are written directly to disk as they arrive. No IndexedDB storage. User grants directory permission once; all files auto-save to that directory.

**Receiver side (IndexedDB fallback):** Chunks are stored in IndexedDB. On completion, assembled into a Blob and browser save dialog is triggered per file. 1GB total queue limit applies.

## Consequences

**Positive:**
- No file size limit on Chromium browsers — can transfer multi-GB files
- Constant memory usage during transfer (~16KB sender buffer, ~16KB receiver buffer)
- IndexedDB fallback ensures the app works on all browsers, even if with a size cap
- No artificial limit imposed on the user

**Negative:**
- File System Access API is not available on Safari/iOS — those users get the 1GB IndexedDB fallback
- The two storage paths add code complexity (two write paths, two error handling paths)
- IndexedDB fallback still has a 1GB limit per session
- `showSaveFilePicker` requires a user gesture (click) to request directory permission

## Alternatives Considered

1. **500MB universal limit**: Simple, consistent. Cons: Unnecessarily restrictive on desktop Chrome/Edge, prevents large file transfers.
2. **Per-platform limits (500MB mobile, 2GB desktop)**: Maximizes each platform. Cons: Complex detection, inconsistent UX.
3. **OPFS (Origin Private File System)**: Streaming without user permission prompt. Cons: Not supported on Safari/iOS, no native save dialog, files are in a private origin store.
4. **Server-side storage**: Store files on the signaling server. Cons: Requires server infrastructure, defeats local-only privacy.

## Related Decisions

- Chunk Size 16KB (ADR-0011) — chunk size for streaming
- SCTP Backpressure (ADR-0017) — sender pacing via `bufferedamountlow`
- FILE_RECEIVED Ack and NACK (ADR-0016) — reliability over the data channel
- Batch Processing for Downloads (ADR-0005) — still used by the IndexedDB fallback path
- IndexedDB for Storage (ADR-0015) — fallback storage backend
