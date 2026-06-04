# 36. Automatic WebSocket Connection to Page Host

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: Server URL input section of ADR-0031

## Context

ADR-0031 originally stated: "Other devices type the URL → see a list of online devices." This implied users would manually enter the server's URL (e.g., `http://192.168.1.100:3000`) to connect to the WebSocket signaling server.

Manual URL entry creates friction, especially when the server and client are running on the same machine or when users frequently reconnect.

## Decision

**Client automatically connects WebSocket to the same host that served the page**, using the path `/ws`.

- WebSocket URL: `ws://${window.location.host}/ws`
- No URL input UI is presented to users
- The Express server serves both HTTP (static files) and WebSocket on the same host
- In development, Vite proxies `/ws` to the Express server (see ADR-0034)

Device list visibility serves as the connection status indicator: if users see the device list, WebSocket is connected.

## Consequences

**Positive:**
- Seamless user experience - no manual URL entry required
- Identical client code for development and production
- Works automatically for any host (localhost, IP addresses, domain names)
- Simpler UI with no server configuration

**Negative:**
- Less explicit feedback about connection status
- Cannot connect to a different server than the page host without page reload
- Requires proxy configuration for development (ADR-0034)

## Alternatives Considered

1. **Manual URL input**: Users enter server URL in a dedicated field. Pros: Flexible, can connect to any server. Cons: Extra UI, worse UX, contradicts automatic discovery goal.
2. **Server URL in localStorage**: Remember last server URL. Pros: Convenience. Cons: Stale URLs, security concerns, extra state management.
3. **mDNS service discovery**: Automatically discover server on local network. Pros: True automatic discovery. Cons: Limited browser support, complex implementation.
