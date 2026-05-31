# 21. IndexedDB for Browser Storage

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to store file chunks, metadata, and application state persistently within the browser. Files can be up to 500MB, and we need to handle them in 8KB chunks. The storage solution must work across all modern browsers without requiring server infrastructure.

## Decision

Use **IndexedDB** as the storage mechanism for:
- File chunks (binary data)
- File metadata (name, size, mime type, state, timestamps)
- Connection metadata (connection ID, secret, state)
- File queue information (order, state)

## Database Schema

```
Database: LocalFileShare
├── Object Store: connections
│   └── Key: connectionId (string)
│   └── Value: { connId, secret, state, createdAt, lastActivityAt, peerInfo? }
│
├── Object Store: files
│   └── Key: connId + "__" + fileId (composite string)
│   └── Value: { connId, fileId, name, size, mime, state, createdAt, completedAt?, direction }
│
├── Object Store: chunks
│   └── Key: connId + "__" + fileId + "__" + index (composite string)
│   └── Value: { connId, fileId, index, data: ArrayBuffer, isLast: boolean }
│
└── Object Store: queue
    └── Key: connId + "__" + fileId (composite string)
    └── Value: { connId, fileId, order: number }
```

## Consequences

**Positive:**
- Large storage capacity (typically 50-80% of disk space on desktop, several GB on mobile)
- Sufficient for our 500MB queue limit requirement
- Asynchronous API fits well with our async architecture
- Transaction support for atomic operations
- Indexes allow efficient querying
- Works in all modern browsers
- No external dependencies required

**Negative:**
- Asynchronous API requires promise-based code
- Can be blocked by user's storage quota
- Mobile browsers may have stricter limits
- Requires user permission in some browsers
- More complex API than localStorage
- Debugging can be challenging

## Alternatives Considered

1. **localStorage/sessionStorage**: Simple key-value storage. Pros: Simple synchronous API, widely supported. Cons: Limited to ~5-10MB, synchronous (blocks main thread), string-only (requires base64 encoding for binary).

2. **Cache API**: Service Worker cache storage. Pros: Good for HTTP resources, persistent. Cons: Designed for HTTP requests, not suitable for arbitrary binary data, limited browser support for non-HTTP use.

3. **File System Access API**: Direct file system access. Pros: Can handle very large files, integrates with OS. Cons: Limited browser support (Chrome only), requires user permission per-file, not suitable for our use case.

4. **OPFS (Origin Private File System)**: Private file system for web apps. Pros: High performance, large capacity. Cons: Limited browser support (Chrome, Edge), requires secure context (HTTPS), not available in Safari/iOS.

5. **Server-side storage**: Store files on a server. Pros: Reliable, large capacity. Cons: Requires server infrastructure, defeats our browser-only requirement.

## Related Decisions

- Browser-only with no external servers (ADR-0001)
- 500MB file limit (ADR-0005)
- Store per connection (composite keys)
- Discard queued files on connection close (ADR-0018)
- Batch processing for downloads (ADR-0008)
