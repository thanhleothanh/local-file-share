# 14. WebRTC Data Channels for Direct P2P Communication

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to establish direct peer-to-peer communication between browsers for file transfer. The solution must support bidirectional data transfer, work on local networks without external servers, and be compatible with all modern browsers.

## Decision

Use **WebRTC Data Channels** for direct peer-to-peer file transfer between browsers.

WebRTC provides the following capabilities we need:
- `RTCPeerConnection`: Establishes direct connection between peers
- `RTCDataChannel`: Bidirectional data channel for sending/receiving arbitrary data
- Built-in encryption via DTLS-SRTP
- ICE framework for NAT traversal (works on local networks without external STUN/TURN)
- Supported by all modern browsers (Chrome, Firefox, Edge, Safari, iOS, Android)

We use **two separate data channels** per connection:
- `control` channel: JSON signaling messages (FILE_OFFER, FILE_ACCEPT, etc.)
- `data` channel: Binary file chunks

## Consequences

**Positive:**
- True P2P — files transfer directly without intermediaries
- Encrypted by default (privacy preserved)
- No server infrastructure required
- Works on local networks without internet
- Low latency for local transfers
- Bidirectional communication built-in

**Negative:**
- Requires signaling to establish connection (solved via WebSocket in ADR-0019)
- ICE candidate gathering can be complex
- Browser message size limit (~16KB) requires chunking our files (ADR-0011)
- NAT traversal complexity (mitigated by same-network assumption)

## Alternatives Considered

1. **HTTP/WebSockets with local server**: One device acts as HTTP server. Pros: Simpler to implement, familiar API. Cons: Not pure P2P, one device must host, requires separate process or native code.

2. **WebTorrent**: P2P file sharing library. Pros: Built-in discovery, handles chunking. Cons: Uses external trackers by default, heavier library (~1MB), more complex than needed.

3. **WebRTC with single data channel**: Use one channel for both control and data. Pros: Simpler, fewer channels to manage. Cons: Need message framing, control messages can be blocked by large data transfers.

4. **Raw TCP/UDP sockets**: Direct socket programming. Pros: Maximum control. Cons: Not available in browsers.

5. **Bluetooth/WiFi Direct**: Native device-to-device protocols. Pros: Designed for local transfer. Cons: Limited browser support, requires native apps, not universal.

## Related Decisions

- WebRTC for P2P file transfer (ADR-0001)
- WebSocket Signaling Server (ADR-0019)
- Separate data channels for control and data (ADR-0004)
- Default ICE configuration works for local networks
