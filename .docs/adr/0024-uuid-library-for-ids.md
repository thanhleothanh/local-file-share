# 24. UUID Library for Unique Identifiers

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to generate unique identifiers for:
- **Connection IDs**: Unique identifier for each connection between two devices
- **File IDs**: Unique identifier for each file being transferred

These IDs must be:
- **Globally unique**: No collisions between different connections or files
- **Consistent format**: Fixed length for predictable storage and header size
- **URL-safe**: Can be safely included in QR codes and JSON messages
- **Deterministic size**: File ID must be exactly 36 bytes for our 41-byte binary header (ADR-0014)

## Decision

Use **uuid** library (v9+) to generate UUID v4 identifiers for both connection IDs and file IDs.

UUID v4 provides:
- **128-bit random identifiers**
- **36-character string representation** (32 hex chars + 4 hyphens)
- **Effectively globally unique** (1 in 2^122 chance of collision)
- **No central authority** needed (unlike UUID v1)
- **Standard format** (RFC 4122)

### ID Generation
```javascript
import { v4 as uuidv4 } from 'uuid';

// Generate connection ID
const connectionId = uuidv4(); // e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479"

// Generate file ID
const fileId = uuidv4(); // e.g., "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
```

### Binary Header Usage
The file ID string (36 bytes UTF-8) is used directly in our 41-byte binary header:
```
[0-35: fileId (36 bytes UTF-8)][36-39: index (4 bytes)][40: isLast (1 byte)][41+: data]
```

## Consequences

**Positive:**
- Standard, well-tested library
- Small footprint (~5KB minified)
- Works in all modern browsers
- No dependencies
- Can be loaded from CDN
- UUID v4 is random, not predictable (good for security)
- 36-character string fits perfectly in our binary header design

**Negative:**
- Adds ~5KB to bundle size
- Hyphens in UUID strings require UTF-8 encoding (still 36 bytes)
- UUID v4 is random, not sequential (can't derive order from ID)

## Alternatives Considered

1. **Custom random ID generator**: Implement our own. Pros: No library needed, smaller footprint. Cons: Need to implement properly, risk of collisions or bugs, still need ~36 bytes for uniqueness.

2. **ULID**: Sortable unique IDs. Pros: Sortable by time. Cons: Longer than UUID, library needed.

3. **Nano ID**: Short unique string IDs. Pros: Shorter than UUID. Cons: Variable length, may need to be padded to 36 bytes for our header, less standard.

4. **CUID**: Collision-resistant unique identifiers. Pros: Designed to avoid collisions. Cons: Longer, library needed.

5. **Incremental counters**: Simple counter. Pros: Simple, no library. Cons: Not globally unique, requires persistence, can't be predicted across devices.

6. **Cryptographic random**: Use `crypto.randomUUID()`. Pros: No library needed in modern browsers. Cons: Not available in all browsers (Safari < 14.1, older browsers), polyfill needed anyway.

## Related Decisions

- Binary header format with 36-byte fileId (ADR-0014)
- Connection secret in QR (ADR-0004)
- Store per connection (requires connection IDs)
