# 32. Remove QR Code Infrastructure

**Status**: Accepted  
**Date**: 2026-06-03  
**Supersedes**: ADR-0004 (Connection Secret in QR), ADR-0012 (QR Compression), ADR-0016 (zxing-js/browser for QR Generation), ADR-0022 (zxing-js/browser for QR Scanning), ADR-0023 (pako for gzip compression)

## Context

The WebSocket signaling server (ADR-0031) replaces the two-QR code handshake (ADR-0003) for device discovery and connection establishment. QR codes are no longer needed for signaling.

The existing QR infrastructure includes:

- `src/modules/qrHandler.js` — QR code generation and scanning
- `src/utils/qrCompression.js` — gzip + base64 compression for QR payloads
- Dependencies: `@zxing/browser`, `@zxing/library`, `pako`
- UI elements: QR canvases, scanner videos, step progress indicators

## Decision

**Remove all QR code infrastructure** from the application and replace with WebSocket-based device discovery and connection (see ADR-0031).

### Files Deleted

- `src/modules/qrHandler.js`
- `src/utils/qrCompression.js`

### Dependencies Removed

- `@zxing/browser` — QR code generation and scanning
- `@zxing/library` — QR code encoding hints
- `pako` — gzip compression for QR payloads

Note: The `uuid` dependency is retained for generating device IDs (stored in localStorage).

### Dependencies Added

- `express` — HTTP server for serving static files
- `ws` — WebSocket server for signaling
- `random-words` — Device naming (see ADR-0035)
- `concurrently` — Development server orchestration (see ADR-0034)

### UI Elements Removed

- `offerQRCanvas`, `answerQRCanvas` — QR display canvases
- `scannerVideo`, `answerScannerVideo` — camera scanner elements
- `stepDots`, `stepLines`, `stepPanes` — 3-step progress UI
- `step1Idle`, `step1Initiator`, `step1Joiner` — step 1 panes
- `step2Initiator`, `step2Joiner` — step 2 panes
- All QR-related event listeners and handlers in `main.js`

### UI Elements Added

- Device list showing online devices
- Descriptive device names with "You" indicator
- Connect/Disconnect buttons per device
- Modal dialog for accept/reject connection requests

### Code Changes

- `webrtcManager.js` — Remove `generateOfferQR()`, `scanOfferQR()`, `scanAnswerQR()` methods. Add WebSocket-based signaling methods instead.
- `main.js` — Remove all QR-related orchestration code. Replace with device list UI, WebSocket connection management, and connection request handling.
- `index.html` — Remove QR-related DOM elements. Add device list container and connection UI.
- `vite.config.js` — Add proxy for WebSocket in development (see ADR-0034)

### Server Addition

- `server.js` — New file containing Express server with WebSocket support, serving static files from `dist/` (see ADR-0033)

### Deployment Addition

- `Dockerfile` — Single container for building and running the application (see ADR-0033)

### Test Changes

- `tests/unit/qrCompression.test.js` — Delete entirely
- `tests/regression/regression.test.js` — Remove QR-related test cases
- New test file for WebSocket signaling client

## Consequences

**Positive:**

- Simpler codebase — removed ~500 lines of QR-related code
- Smaller bundle — removed 3 dependencies (~200KB)
- No camera requirement — works on all devices
- No QR compression — WebSocket handles large payloads easily
- Cleaner UI — no QR canvases, scanner videos, or step progress

**Negative:**

- No fallback if the WebSocket server is down (devices can't discover each other)
- Requires running a Node.js server on the network
- Loss of the "no infrastructure" property (ADR-0001)
- Build step required before running (client must be built to `dist/`)

## Alternatives Considered

1. **Keep QR as fallback**: Maintain QR codes for when the server is unavailable. Pros: More resilient. Cons: Contradicts user requirement, adds significant complexity, dead code if server is always available.
2. **Remove QR UI only**: Keep the code files but strip all QR references from the UI. Pros: Code available for future use. Cons: Dead code in the repo, confusing for contributors.
3. **Replace with new QR format**: Use CBOR encoding and shorter identifiers. Pros: Smaller QR codes. Cons: Still requires cameras, still a two-step process, doesn't solve the fundamental UX problem.
