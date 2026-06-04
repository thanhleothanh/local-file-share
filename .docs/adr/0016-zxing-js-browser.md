# 16. zxing-js/browser for QR Code Scanning

**Status**: Superseded by [ADR-0032](./0032-remove-qr-code-infrastructure.md)  
**Date**: 2026-05-31

## Context

We need to scan QR codes from the browser to exchange WebRTC signaling information. The library must work on both desktop and mobile browsers, including iOS Safari.

## Decision

Use **[zxing-js/browser](https://github.com/zxing-js/browser)** library for QR code scanning.

**Size:** ~300KB (minified + gzipped)
**Features:**

- Camera streaming support
- Works on all modern browsers (Chrome, Firefox, Edge, Safari)
- Actively maintained
- Good mobile support

## Consequences

**Positive:**

- Reliable QR scanning across all target platforms
- Good performance
- Modern API (async/await)
- Well-documented

**Negative:**

- Adds ~300KB to bundle size
- Requires camera permissions
- External dependency

## Alternatives Considered

1. **instascan**: ~150KB, older but simple. Pros: Smaller. Cons: Less maintained, some mobile issues.
2. **quagga2**: ~500KB, fork of Quagga. Pros: Mature. Cons: Heavier, complex.
3. **Native BarcodeDetector**: `new BarcodeDetector()`. Pros: No library, 0KB. Cons: Chrome 83+ only, not Safari.
4. **Custom Implementation**: Use getUserMedia + canvas. Pros: No dependency. Cons: Complex, error-prone.
