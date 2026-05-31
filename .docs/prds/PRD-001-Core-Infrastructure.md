# PRD-001: Core Infrastructure

## Problem Statement

We need to establish peer-to-peer connections between browsers on the same local network without any external servers. Users should be able to connect by scanning QR codes.

## Solution

Implement the foundational WebRTC connection establishment infrastructure with QR code-based handshake and connection state management.

## User Stories

### Connection Establishment
1. As a user, I want to generate a QR code containing my WebRTC offer so that another device can scan it to start the connection process
2. As a user, I want to scan a QR code containing a WebRTC offer so that I can respond with my answer
3. As a user, I want to generate a second QR code containing my WebRTC answer so that the initiator can complete the connection
4. As a user, I want to scan the second QR code to complete the WebRTC connection
5. As a user, I want the connection to be authenticated using a shared secret from the QR codes so that only intended devices can connect
6. As a user, I want to see connection status (connecting, connected, failed) so that I know the connection state
7. As a user, I want the connection to automatically close after 5 minutes of inactivity so that resources are not wasted
8. As a user, I want only one active connection at a time so that I don't accidentally share files with wrong device

### QR Code Handling
9. As a user on mobile, I want to use my device's camera to scan QR codes so that I can establish connections
10. As a user on desktop, I want to use my webcam to scan QR codes so that I can establish connections
11. As a user, I want QR codes to be generated with proper compression so that they are scannable even with large WebRTC signaling data
12. As a user, I want invalid QR codes to be rejected with clear feedback so that I know what went wrong

## Implementation Decisions

### Modules
- **QR Code Module**: Handle QR code generation and scanning using zxing-js/browser, with gzip+base64 compression/decompression
- **WebRTC Connection Manager**: Manage the WebRTC peer connection lifecycle including offer/answer/ICE candidate exchange
- **Signaling Message Parser**: Parse and validate signaling data from QR codes (SDP, ICE candidates, secret, connection ID)
- **Connection State Machine**: Implement the 5-state machine (NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED) with idle timeout
- **Connection Store**: Store active connection metadata (connection ID, secret, peer info)

### Interfaces
- `QRHandler.generateOfferQR(connId, secret, offer, iceCandidates) -> string` - Generate QR code with compressed offer
- `QRHandler.generateAnswerQR(connId, secret, answer, iceCandidates) -> string` - Generate QR code with compressed answer
- `QRHandler.scanQR() -> Promise<QRData>` - Scan QR code from camera
- `WebRTCManager.createPeerConnection(config) -> RTCPeerConnection` - Create new peer connection
- `WebRTCManager.setupDataChannels(peerConnection) -> {controlChannel, dataChannel}` - Create separate control and data channels
- `ConnectionStateManager.transition(state, event) -> newState` - Handle state transitions
- `ConnectionStore.saveConnection(connId, secret, peerInfo)` - Store connection metadata
- `ConnectionStore.getConnection(connId)` - Retrieve connection metadata
- `ConnectionStore.clearConnection(connId)` - Remove connection on close

### Technical Decisions
- Use zxing-js/browser library for QR code scanning (ADR-0016)
- Two-QR ping-pong handshake (ADR-0003)
- Connection secret included in QR codes (ADR-0004)
- gzip + base64 compression for QR payload (ADR-0012)
- Pure WebRTC without signaling server (ADR-0001, ADR-0002)
- Two separate data channels: control (JSON) and data (binary) (ADR-0007)
- 1:1 connections only, reject new if active connection exists (ADR-0017)
- 5-minute idle timeout in CONNECTED state, resets on network activity (ADR-0010)
- Idle timer only counts time in CONNECTED state (not TRANSFERRING)

### QR Data Structure
```
OFFER_QR: {type: "OFFER", payload: base64(gzip({sdp, ice: []})), secret: string, connId: string}
ANSWER_QR: {type: "ANSWER", payload: base64(gzip({sdp, ice: []})), secret: string, connId: string}
```

## Testing Decisions

### Test Strategy
- Test QR code generation and scanning with various payload sizes
- Test WebRTC connection establishment between two browser instances
- Test connection secret validation
- Test connection state transitions
- Test idle timeout behavior
- Test 1:1 connection enforcement (reject new connection if already connected)

### Modules to Test
- QR code generation with compression
- QR code scanning and decompression
- WebRTC offer/answer exchange via QR
- Connection state machine transitions
- Idle timeout trigger and reset

### Test Approach
- Unit tests for QR compression/decompression logic
- Integration tests for WebRTC handshake via mock QR scanning
- State machine transition tests
- Manual testing for camera-based QR scanning

## Out of Scope

- File transfer logic (PRD-002)
- File queue management (PRD-002)
- User interface for file selection (PRD-003)
- Progress display (PRD-003)
- Storage/persistence (PRD-004)

## Further Notes

- The idle timeout should only count time when in CONNECTED state (no active transfers)
- The idle timer resets on any control or data channel message
- Connection secret is used to verify both QR codes belong to the same connection attempt
- ICE candidates should be gathered with default configuration (works for most local networks)
- WebRTC connection uses default STUN servers if available, but designed for local network where direct connection is possible
