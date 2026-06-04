# 3. Two-QR Code Handshake for Connection Establishment

**Status**: Superseded by [ADR-0031](./0031-websocket-signaling-server.md)  
**Date**: 2026-05-31

## Context

We need a way for devices to discover each other and exchange WebRTC signaling information (SDP offers/answers and ICE candidates) without a central signaling server. The solution must work on all devices including mobile phones.

## Decision

Use a **two-QR code ping-pong handshake**:

1. **Device A** (initiator): Generates QR #1 containing WebRTC offer + ICE candidates + connection secret + connection ID
2. **Device B** (joiner): Scans QR #1, creates answer, generates QR #2 with answer + ICE candidates + same secret + same connection ID
3. **Device A**: Scans QR #2, completes WebRTC handshake

The connection secret and ID are used to verify the two QRs belong to the same connection attempt.

## Consequences

**Positive:**

- No server infrastructure required
- Works on all devices with cameras
- Simple user flow
- Connection-specific authentication via secret

**Negative:**

- Requires camera on at least one device per connection
- Two-step process (scan QR #1, then scan QR #2)
- QR code size limitations require compression (gzip + base64)
- Desktop-to-desktop requires webcams

## Alternatives Considered

1. **Single QR + Manual Entry**: One QR with offer, user manually enters answer. Pros: One QR. Cons: Error-prone manual entry.
2. **mDNS/ZeroConf**: Automatic discovery. Pros: No user interaction. Cons: Limited browser support.
3. **Local CLI Server**: One device runs a local WebSocket server. Pros: One QR. Cons: Not pure browser, requires separate process.
4. **Public Signaling Server**: Use hosted server for signaling. Pros: One QR, reliable. Cons: Requires internet, adds infrastructure.
