# 15. IndexedDB for Browser Storage (Fallback)

**Status**: Accepted  
**Date**: 2026-06-03

## Context

We need to store file chunks and metadata in the browser. With streaming via File System Access API (ADR-0002), the primary storage path writes directly to disk. IndexedDB serves as the **fallback** for browsers that don't support File System Access API (Safari, iOS, Firefox).

## Decision

Use **IndexedDB** as the fallback storage mechanism for browsers without File System Access API support.

**Primary path (File System Access API):** Chunks are written directly to disk. No IndexedDB usage.

**Fallback path (IndexedDB):** Used on Safari, iOS, Firefox. Stores:
- File chunks (binary data) — during transfer only
- File metadata (name, size, mime type, state, timestamps)
- File queue information (order, state)

## Database Schema (Fallback Only)

```
Database: LocalFileShare
├── Object Store: files
│   └── Key: connId + "__" + fileId (composite string)
│   └── Value: { connId, fileId, name, size, mime, state, createdAt, completedAt?, direction }
│
└── Object Store: chunks
    └── Key: connId + "__" + fileId + "__" + index (composite string)
    └── Value: { connId, fileId, index, data: ArrayBuffer, isLast: boolean }
```

## Consequences

**Positive:**
- Cross-browser support — works everywhere, even if with a 1GB queue limit (ADR-0006)
- Asynchronous API fits well with async architecture
- Transaction support for atomic operations
- No external dependencies required

**Negative:**
- 1GB queue limit applies to fallback path (ADR-0006)
- Browser save dialog triggered per file on completion (no auto-save)
- Asynchronous API requires promise-based code
- Can be blocked by user's storage quota
- Debugging can be challenging

## Alternatives Considered

1. **localStorage**: Simple key-value storage. Cons: Limited to ~5-10MB, synchronous (blocks main thread), string-only.
2. **Cache API**: Service Worker cache storage. Cons: Designed for HTTP requests, not suitable for arbitrary binary data.
3. **OPFS (Origin Private File System)**: High performance. Cons: Not supported on Safari/iOS, no native save dialog.
4. **Server-side storage**: Store files on signaling server. Cons: Requires server infrastructure, defeats local-only privacy.

## Related Decisions

- No File Size Limit / Streaming (ADR-0002) — primary storage path
- FIFO Queue Conditional Limits (ADR-0006) — 1GB limit for IndexedDB fallback
- Batch Processing for Downloads (ADR-0005) — used by fallback to assemble chunks into Blob
- Discard Queued on Close (ADR-0013) — cleanup on disconnect
