# 4. Separate Data Channels for Control and Data

**Status**: Accepted  
**Date**: 2026-05-31

## Context

WebRTC allows creating multiple data channels. We need to transmit two types of information: JSON control messages (file offers, accepts, etc.) and binary file chunk data. These could share one channel or use separate channels.

## Decision

Create **two separate WebRTC data channels**:
- **`control`**: JSON messages only (FILE_OFFER, FILE_ACCEPT, FILE_REJECT, TRANSFER_DONE, CLOSE, CANCELLED)
- **`data`**: Binary file chunks only (with 41-byte header)

## Consequences

**Positive:**
- Clear separation of concerns
- No need for message framing/type detection on data channel
- Control messages never blocked by large file chunks
- Easier to debug (can monitor channels separately)

**Negative:**
- Two channels to manage instead of one
- Slightly more WebRTC setup code
- marginallly more overhead (but negligible)

## Alternatives Considered

1. **Single Channel with Framing**: Use first byte to indicate message type (0x00=JSON, 0x01=binary). Pros: One channel. Cons: Need framing logic, more complex parsing.
2. **Single Channel with JSON Wrapper**: Wrap chunks as `{type: "CHUNK", fileId, index, data: base64}`. Pros: Simple. Cons: 33% base64 overhead, slow.
3. **Single Channel with CBOR**: Binary JSON for all messages. Pros: Compact. Cons: Complex, requires library.
