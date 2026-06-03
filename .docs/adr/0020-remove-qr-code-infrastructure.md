# 20. No QR Code Infrastructure

**Status**: Accepted  
**Date**: 2026-06-03

## Context

QR codes are not part of this application. The WebSocket signaling server (ADR-0019) is the sole mechanism for device discovery and WebRTC signaling.

## Decision

**Do not build QR code infrastructure.** The WebSocket signaling server (ADR-0019) is the sole mechanism for device discovery and WebRTC signaling.

## Consequences

**Positive:**
- No camera requirement — works on devices without cameras
- No external dependencies for QR (smaller bundle)
- Simpler codebase — no QR generation, scanning, or compression code
- Single-step connection — click to connect, accept, done

**Negative:**
- No fallback if the WebSocket server is down (devices cannot connect)
- Requires running a Node.js server on the network

## Alternatives Considered

1. **QR as fallback**: Maintain QR codes for when the server is unavailable. Cons: Adds significant complexity, requires cameras, two-step process.
2. **QR as primary**: Keep QR codes as the main connection method. Cons: Requires cameras on both devices, worse UX than click-to-connect.
