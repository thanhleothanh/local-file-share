# 12. QR Code Compression for WebRTC Signaling

**Status**: Superseded by [ADR-0031](./0031-remove-qr-code-infrastructure.md)  
**Date**: 2026-05-31

## Context

WebRTC SDP offers/answers and ICE candidates can be large (2-4KB). QR codes have practical size limits (~3KB for reliable scanning). We need to fit signaling data into QR codes.

## Decision

Compress WebRTC signaling data using **gzip** and encode as **Base64** before including in QR codes.

**Format:**
```json
{
  "type": "OFFER" | "ANSWER",
  "payload": "<base64 of gzip({sdp: string, ice: ICECandidate[]})>",
  "secret": "<random 16-char string>",
  "connId": "<uuid>"
}
```

**Compression:**
- Combine SDP + ICE candidates into single object
- Gzip compress the object
- Base64 encode the compressed data
- Include in QR payload field

**Decompression:**
- Base64 decode payload
- Gzip decompress
- Parse JSON to get SDP and ICE candidates

## Consequences

**Positive:**
- Fits signaling data reliably in QR codes
- Reduces QR code size by ~50-70%
- Works with standard QR scanners
- No data loss

**Negative:**
- Adds ~10KB library (pako.js) for gzip in browser
- Slight CPU overhead for compression/decompression
- Small delay in QR generation/scanning

## Alternatives Considered

1. **Truncate ICE Candidates**: Only include essential candidates. Pros: Fits without compression. Cons: May fail if direct path not found.
2. **Split Across Multiple QRs**: First QR has offer, second has candidates. Pros: No compression. Cons: Defeats 2-QR simplicity.
3. **Use Short Codes**: Generate short room IDs, use STUN for discovery. Pros: Small QR. Cons: Requires STUN server, not pure P2P.
4. **Custom Binary Encoding**: Encode SDP/ICE more compactly. Pros: More efficient. Cons: Complex, non-standard.
