# 24. UUID Library for Unique Identifiers

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to generate unique identifiers for:

- **Device IDs**: Unique identifier for each device, persisted in localStorage across page refreshes
- **Connection IDs**: Unique identifier for each WebRTC connection between two devices
- **File IDs**: Unique identifier for each file being transferred

These IDs must be:

- **Globally unique**: No collisions between different devices, connections, or files
- **Consistent format**: Fixed length for predictable storage and header size
- **Deterministic size**: File ID must be exactly 36 bytes for our 41-byte binary header (ADR-0014)

## Decision

Use **uuid** library (v9+) to generate UUID v4 identifiers for device IDs, connection IDs, and file IDs.

UUID v4 provides:

- **128-bit random identifiers**
- **36-character string representation** (32 hex chars + 4 hyphens)
- **Effectively globally unique** (1 in 2^122 chance of collision)
- **No central authority** needed (unlike UUID v1)
- **Standard format** (RFC 4122)

Note: While ADR-0032 removes QR code infrastructure, the `uuid` library is retained for generating unique identifiers in the WebSocket-based architecture.

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

## Related Decisions

- Binary header format with 36-byte fileId (ADR-0014)
- Device identification with UUID persistence (ADR-0031)
- WebSocket signaling server replaces QR but retains UUID usage (ADR-0031, ADR-0032)
