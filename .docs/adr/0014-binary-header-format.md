# 14. Binary Header Format for Data Channel

**Status**: Accepted  
**Date**: 2026-05-31

## Context

Data channel messages contain binary file chunks. We need to identify which file and chunk index each message belongs to, and whether it's the last chunk.

## Decision

Use a **fixed 41-byte binary header** prefixing each chunk:

| Field | Size | Format | Description |
|-------|------|--------|-------------|
| fileId | 36 bytes | UTF-8 string | UUID identifying the file |
| index | 4 bytes | Big-endian Uint32 | Chunk sequence number (0-indexed) |
| isLast | 1 byte | 0 or 1 | 1 if this is the last chunk, 0 otherwise |

**Structure:**
```
[0-35: fileId][36-39: index][40: isLast][41+: chunk data]
```

**Parsing:**
```javascript
dataChannel.onmessage = (event) => {
  const buffer = event.data;
  if (buffer.byteLength < 41) return; // Ignore malformed
  
  const fileId = new TextDecoder().decode(buffer.slice(0, 36));
  const index = new DataView(buffer.slice(36, 40)).getUint32(0, false); // big-endian
  const isLast = buffer[40] === 1;
  const chunkData = buffer.slice(41);
  
  storeChunk(connId, fileId, index, chunkData, isLast);
};
```

## Consequences

**Positive:**
- Fixed size, easy to parse
- No JSON overhead
- Works with raw ArrayBuffer
- Clear separation of metadata and data

**Negative:**
- 41 bytes overhead per chunk (~0.5% for 8KB chunks)
- Need binary parsing code
- Malformed messages < 41 bytes are ignored (fail silently)

## Alternatives Considered

1. **JSON Header**: `{fileId, index, isLast}` as JSON + data. Pros: Easy to read. Cons: Variable size, JSON parsing overhead.
2. **TLV Encoding**: Type-Length-Value format. Pros: Flexible. Cons: Complex parsing.
3. **Separate Messages**: Send metadata on control channel, data on data channel. Pros: No header overhead. Cons: Two messages per chunk, complex coordination.
4. **CBOR**: Binary JSON. Pros: Compact. Cons: Requires library.
