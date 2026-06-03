# 31. Remove QR Code Infrastructure

**Status**: Accepted  
**Date**: 2026-06-03  
**Supersedes**: ADR-0004 (Connection Secret in QR), ADR-0012 (QR Compression), ADR-0016 (zxing-js/browser for QR Generation), ADR-0022 (zxing-js/browser for QR Scanning), ADR-0023 (pako for gzip compression)

## Context

The WebSocket signaling server (ADR-0030) replaces the two-QR code handshake (ADR-0003) for device discovery and connection establishment. QR codes are no longer needed for signaling. The existing QR infrastructure includes:

- `src/modules/qrHandler.js` — QR code generation and scanning
- `src/utils/qrCompression.js` — gzip + base64 compression for QR payloads
- Dependencies: `@zxing/browser`, `@zxing/library`, `pako`
- UI elements: QR canvases, scanner videos, step progress indicators

## Decision

**Remove all QR code infrastructure** from the application:

### Files Deleted
- `src/modules/qrHandler.js`
- `src/utils/qrCompression.js`

### Dependencies Removed
- `@zxing/browser` — QR code generation and scanning
- `@zxing/library` — QR code encoding hints
- `pako` — gzip compression for QR payloads
- `uuid` — replaced with simpler client-generated IDs

### UI Elements Removed
- `offerQRCanvas`, `answerQRCanvas` — QR display canvases
- `scannerVideo`, `answerScannerVideo` — camera scanner elements
- `stepDots`, `stepLines`, `stepPanes` — 3-step progress UI
- `step1Idle`, `step1Initiator`, `step1Joiner` — step 1 panes
- `step2Initiator`, `step2Joiner` — step 2 panes
- All QR-related event listeners and handlers in `main.js`

### Code Changes
- `webrtcManager.js` — Remove `generateOfferQR()`, `scanOfferQR()`, `scanAnswerQR()` methods. Add WebSocket-based signaling methods instead.
- `main.js` — Remove all QR-related orchestration code. Replace with device list UI, WebSocket connection management, and per-device file transfer view.
- `index.html` — Remove QR-related DOM elements. Add device list container, per-device file transfer view.

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
- No fallback if the WebSocket server is down (devices can't connect)
- Requires running a Node.js server on the network
- Loss of the "no infrastructure" property (ADR-0001)

## Alternatives Considered

1. **Keep QR as fallback**: Maintain QR codes for when the server is unavailable. Pros: More resilient. Cons: Contradicts user requirement, adds significant complexity, dead code if server is always available.
2. **Remove QR UI only**: Keep the code files but strip all QR references from the UI. Pros: Code available for future use. Cons: Dead code in the repo, confusing for contributors.
3. **Replace with new QR format**: Use CBOR encoding and shorter identifiers (Issues 001-004). Pros: Smaller QR codes. Cons: Still requires cameras, still a two-step process, doesn't solve the fundamental UX problem.
