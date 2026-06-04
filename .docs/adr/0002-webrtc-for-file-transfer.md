# 2. WebRTC for Peer-to-Peer File Transfer

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to transfer files directly between devices on a local network. The solution must work cross-platform (desktop and mobile browsers) and support large files (up to 500MB).

## Decision

Use **WebRTC data channels** for direct peer-to-peer file transfer. WebRTC provides:
- Direct browser-to-browser communication
- Built-in encryption (DTLS-SRTP)
- Works on local networks without external servers
- Supported by all modern browsers

## Consequences

**Positive:**
- True P2P — files transfer directly without intermediaries
- Encrypted by default
- No server costs for the file transfer itself
- Works on local networks

**Negative:**
- Requires signaling to establish connection (handled via WebSocket server, see ADR-0031)
- ICE candidate gathering can be complex
- Browser message size limit (~16KB) requires chunking
- NAT traversal complexity (mitigated by same-network assumption)

## Alternatives Considered

1. **HTTP/WebSockets**: Would require one device to act as server. Pros: Simpler. Cons: Not pure P2P, one device must host.
2. **WebTorrent**: P2P file sharing library. Pros: Built-in discovery. Cons: Uses external trackers by default, heavier library.
3. **Raw TCP sockets**: Not available in browsers.
4. **Bluetooth/WiFi Direct**: Limited browser support, not universal.
