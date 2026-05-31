# ISSUE-001: QR Code Connection Handshake

## Parent
PRD-001: Core Infrastructure

## What to build
Implement the complete QR code-based WebRTC connection handshake flow. This includes generating offer QR codes, scanning them, generating answer QR codes, scanning those, and establishing a WebRTC peer connection with two separate data channels (control and data).

This is the foundational vertical slice that enables all other functionality.

## Acceptance criteria
- [x] User can click "Create Connection" to generate first QR code (OFFER)
- [x] OFFER QR code contains compressed WebRTC offer, ICE candidates, connection ID, and secret
- [x] User can click "Scan QR Code" to open camera scanner
- [x] Scanner successfully reads OFFER QR code and extracts signaling data
- [x] After scanning OFFER, user is prompted to generate ANSWER QR code
- [x] ANSWER QR code contains compressed WebRTC answer, ICE candidates, connection ID, and secret
- [x] Initiator can scan ANSWER QR code to complete connection
- [x] Connection validates secret from both QR codes matches
- [x] WebRTC peer connection is established with two data channels (control + data)
- [x] Connection state transitions to CONNECTED
- [x] Connection closes after 5 minutes of inactivity (idle timeout)
- [x] Only one active connection allowed (reject new attempts if connection exists)
- [x] Connection state is visible in UI (connecting, connected, failed)
- [x] Invalid QR codes are rejected with clear error message
- [x] QR compression uses gzip + base64 as specified in ADR-0012

## Blocked by
None - can start immediately

## User stories covered
1. As a user, I want to generate a QR code containing my WebRTC offer so that another device can scan it to start the connection process
2. As a user, I want to scan a QR code containing a WebRTC offer so that I can respond with my answer
3. As a user, I want to generate a second QR code containing my WebRTC answer so that the initiator can complete the connection
4. As a user, I want to scan the second QR code to complete the WebRTC connection
5. As a user, I want the connection to be authenticated using a shared secret from the QR codes so that only intended devices can connect
6. As a user, I want to see connection status (connecting, connected, failed) so that I know the connection state
7. As a user, I want the connection to automatically close after 5 minutes of inactivity so that resources are not wasted
8. As a user, I want only one active connection at a time so that I don't accidentally share files with wrong device
9. As a user on mobile, I want to use my device's camera to scan QR codes so that I can establish connections
10. As a user on desktop, I want to use my webcam to scan QR codes so that I can establish connections
11. As a user, I want QR codes to be generated with proper compression so that they are scannable even with large WebRTC signaling data
12. As a user, I want invalid QR codes to be rejected with clear feedback so that I know what went wrong

## Notes
- Uses zxing-js/browser for QR scanning (ADR-0016, ADR-0022)
- Uses pako for gzip compression (ADR-0023)
- Uses uuid for connection IDs (ADR-0024)
- Two separate data channels: control (JSON messages) and data (binary chunks) (ADR-0007)
- QR data structure: `{type: "OFFER"|"ANSWER", payload: base64(gzip({sdp, ice: []})), secret: string, connId: string}`
- Idle timeout only counts in CONNECTED state, resets on any channel activity
