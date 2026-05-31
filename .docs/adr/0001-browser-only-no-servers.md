# 1. Browser-Only with No External Servers

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need a file sharing application that works between devices on the same local network. The application should be easy to deploy and not require any server infrastructure.

## Decision

Build a **pure browser-based application** with no external servers. All functionality runs in the browser, using WebRTC for peer-to-peer file transfer. Devices discover each other and establish direct connections without any intermediary.

## Consequences

**Positive:**
- Zero deployment complexity — users just open a web page
- No server costs or maintenance
- Files never leave the local network (privacy preserved)
- Works offline on local networks

**Negative:**
- Limited to same-network devices only
- WebRTC requires some browser support (works on modern Chrome, Firefox, Edge, Safari)
- No centralized discovery — requires manual QR code scanning
- Mobile browsers have memory limitations (500MB file limit)

## Alternatives Considered

1. **Client-Server with Local Host**: One device runs a local server (Node.js/Python). Pros: Simpler WebRTC setup. Cons: Requires running a process, not pure browser.
2. **Public Signaling Server**: Use a hosted server for WebRTC signaling only. Pros: More reliable connection establishment. Cons: Requires internet, adds infrastructure, files could potentially be intercepted if not properly encrypted.
3. **mDNS/ZeroConf**: Use multicast DNS for automatic device discovery. Pros: No user interaction needed. Cons: Limited browser support, requires native code or workarounds.
