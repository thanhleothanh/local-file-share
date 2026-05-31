# 23. Pako for Gzip Compression in Browser

**Status**: Accepted  
**Date**: 2026-05-31

## Context

WebRTC SDP offers/answers and ICE candidates can be large (2-4KB). QR codes have practical size limits for reliable scanning (~3KB maximum). We need to compress this signaling data before encoding it in QR codes to ensure reliable scanning.

## Decision

Use **pako** library for gzip compression and decompression in the browser.

Pako is a zlib port to JavaScript that provides:
- **Gzip compression/decompression**
- **Deflate compression/decompression**
- **Pure JavaScript** implementation (no native dependencies)
- **Small footprint** (~10KB minified)
- **Fast performance**
- **Works in all modern browsers**

## Implementation

### Compression Flow
```javascript
import { gzip, ungzip } from 'pako';

function compressToBase64(data) {
  // Convert JSON to string
  const jsonString = JSON.stringify(data);
  
  // Compress to gzip
  const compressed = gzip(jsonString, { to: 'string' });
  
  // Encode as base64
  return btoa(String.fromCharCode(...new Uint8Array(compressed)));
}

function decompressFromBase64(base64String) {
  // Decode from base64
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Decompress from gzip
  const decompressed = ungzip(bytes, { to: 'string' });
  
  // Parse JSON
  return JSON.parse(decompressed);
}
```

### Usage in QR Codes
```javascript
// For OFFER QR
const offerData = { 
  type: "OFFER", 
  sdp: offerSdp, 
  ice: iceCandidates,
  secret: connectionSecret,
  connId: connectionId 
};
const compressedPayload = compressToBase64(offerData);
const qrData = { type: "OFFER", payload: compressedPayload };

// For ANSWER QR
const answerData = { 
  type: "ANSWER", 
  sdp: answerSdp, 
  ice: iceCandidates,
  secret: connectionSecret,
  connId: connectionId 
};
const compressedPayload = compressToBase64(answerData);
const qrData = { type: "ANSWER", payload: compressedPayload };
```

## Compression Results

Typical compression ratios for WebRTC signaling data:
- SDP offer: ~1.5KB → ~0.8KB (47% reduction)
- SDP answer: ~1KB → ~0.5KB (50% reduction)
- ICE candidates (10-20): ~2KB → ~1KB (50% reduction)
- Combined signaling data: ~4KB → ~1.5-2KB (50-60% reduction)

This allows the combined offer + ICE candidates to fit reliably within QR code capacity limits.

## Consequences

**Positive:**
- Reduces QR code data size by 50-70%
- Fits signaling data reliably in QR codes
- Well-tested, widely used library
- Small footprint (~10KB)
- Fast compression/decompression
- No data loss (lossless compression)
- Can be loaded from CDN

**Negative:**
- Adds ~10KB to bundle size
- Slight CPU overhead for compression/decompression
- Small delay in QR generation/scanning

## Alternatives Considered

1. **No compression**: Send raw JSON in QR. Pros: Simpler, no library needed. Cons: QR codes may be too large for reliable scanning.

2. **Custom compression**: Implement simple compression. Pros: Smaller footprint. Cons: Less effective, more development effort, potential bugs.

3. **Truncate ICE candidates**: Only include essential candidates. Pros: Fits without compression. Cons: May fail if direct path not found, reduces reliability.

4. **Use MessagePack/Protocol Buffers**: Binary serialization. Pros: More compact than JSON. Cons: Requires library, still may need compression, harder to debug.

5. **Split across multiple QRs**: Use multiple QR codes for signaling. Pros: No compression needed. Cons: Defeats 2-QR simplicity, more complex user flow.

## Related Decisions

- Two-QR handshake for connection establishment (ADR-0003)
- QR compression for WebRTC signaling (ADR-0012) — this document supersedes/expands on ADR-0012
- zxing-js/browser for QR scanning (ADR-0016/ADR-0022)
