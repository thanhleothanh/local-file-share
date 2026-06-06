# 22. zxing-js/browser for QR Code Scanning and Generation

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to generate and scan QR codes in the browser to facilitate the WebRTC connection handshake. The QR codes will contain compressed signaling data (SDP offers/answers, ICE candidates). The solution must work on both desktop and mobile browsers, including iOS and Android.

## Decision

Use **zxing-js/browser** library for both QR code generation and scanning.

This library provides:
- **QR Code Scanning**: Read QR codes from camera or image files
- **QR Code Generation**: Create QR codes from data strings
- **Browser Compatibility**: Works on all modern browsers (Chrome, Firefox, Edge, Safari, iOS Safari, Android Chrome)
- **No Native Dependencies**: Pure JavaScript implementation
- **Good Performance**: Efficient decoding, suitable for real-time camera scanning

## Consequences

**Positive:**
- Single library for both scanning and generation (simpler dependency management)
- Well-maintained, actively developed
- Lightweight (~100KB minified)
- Works with both camera and static images
- Supports all QR code versions (including large data capacities needed for our compressed signaling)
- No server-side components required
- Can be loaded from CDN for easy deployment

**Negative:**
- Adds ~100KB to bundle size
- Camera access requires user permission
- On mobile, may need full-screen scanner for best UX
- Decoding performance varies by device

## Integration Details

### QR Code Generation
```javascript
import { BrowserQRCodeWriter } from '@zxing/browser';

const writer = new BrowserQRCodeWriter();
const qrCodeData = { type: "OFFER", payload: "...", secret: "...", connId: "..." };
const qrCodeString = JSON.stringify(qrCodeData);

// Compress before generating QR (ADR-0012)
const compressed = compressAndEncode(qrCodeString);

// Generate QR code as data URL
const qrCodeUrl = await writer.writeToDataURL(compressed, { 
  width: 256, 
  height: 256,
  margin: 2 
});
```

### QR Code Scanning
```javascript
import { BrowserQRCodeReader } from '@zxing/browser';

const reader = new BrowserQRCodeReader();
const result = await reader.decodeFromVideoDevice(
  undefined, // use default camera
  'qr-scanner-container',
  (result) => {
    if (result.text) {
      const qrData = JSON.parse(decompressAndDecode(result.text));
      // Process QR data
    }
  }
);
```

## Consequences for Compression

Since WebRTC signaling data (SDP + ICE candidates) can be 2-4KB, and QR codes have practical limits (~3KB for reliable scanning), we compress the data using gzip + base64 before encoding in the QR code (ADR-0012).

## Alternatives Considered

1. **jsQR**: Pure JavaScript QR decoder. Pros: Smaller (~15KB), no dependencies. Cons: No generation support (would need separate library), slower than zxing.

2. **QR-Code-Styling**: QR code generation with styling. Pros: Pretty QR codes. Cons: No scanning support.

3. **QuaggaJS**: Advanced barcode scanner. Pros: Supports many barcode types. Cons: Larger (~200KB), focused on barcodes more than QR.

4. **Native BarcodeDetector API**: Browser API for scanning. Pros: No library needed, smaller footprint. Cons: Limited browser support (Chrome 83+, Edge 83+, Opera 69+), no Safari/iOS support, no generation capability.

5. **QRCode.js + jsQR**: Separate libraries for generation and scanning. Pros: Smaller combined footprint. Cons: Two libraries to manage, potential version compatibility issues.

6. **Instascan**: QR scanning library. Pros: Simple API. Cons: Deprecated, no longer maintained, no generation support.

## Related Decisions

- Two-QR handshake for connection establishment (ADR-0003)
- Connection secret in QR codes (ADR-0004)
- QR compression with gzip + base64 (ADR-0012)
- zxing-js/browser for QR code scanning (ADR-0016) — this document supersedes/expands on ADR-0016
- Image upload as alternative QR input source (ADR-0031)
