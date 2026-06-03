# 9. Message Format: JSON + Binary

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to transmit both control messages (file offers, accepts) and binary file data over WebRTC data channels. We have two separate channels: control and data.

## Decision

**Control Channel (JSON only):**
- Message type: Plain JSON objects
- Format: `{type: string, ...payload}`
- Messages: FILE_OFFER, FILE_ACCEPT, FILE_REJECT, TRANSFER_DONE, CLOSE, CANCELLED

**Data Channel (Binary only):**
- Message type: Raw ArrayBuffer
- Format: 41-byte header + chunk data
- Header: fileId (36 bytes UTF-8) + index (4 bytes big-endian Uint32) + isLast (1 byte)

**Example Control Message:**
```json
{
  "type": "FILE_OFFER",
  "connId": "uuid",
  "fileId": "uuid",
  "name": "document.pdf",
  "size": 1048576,
  "mime": "application/pdf"
}
```

**Example Data Message:**
```
[36 bytes: fileId][4 bytes: index][1 byte: isLast][16384 bytes: chunk data]
```

## Consequences

**Positive:**
- Clear separation: control vs. data
- No framing needed on data channel
- Efficient binary format for chunks
- Human-readable control messages

**Negative:**
- Two different parsing approaches
- Header overhead on data channel (41 bytes per chunk)
- Need to handle malformed messages

## Alternatives Considered

1. **Single Format**: JSON for everything, chunks as `{type: "CHUNK", fileId, index, data: base64}`. Pros: Consistent. Cons: 33% base64 overhead, slow.
2. **Single Format Binary**: Custom binary for all messages. Pros: Compact. Cons: Complex, hard to debug.
3. **Framing on Single Channel**: First byte indicates type. Pros: One channel. Cons: Need framing logic.
