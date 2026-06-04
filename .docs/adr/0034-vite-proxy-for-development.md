# 34. Vite Proxy for WebSocket in Development

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: None

## Context

In production, the Express server serves static files and handles WebSocket connections on the same port (3000). In development, we need to run both the Vite dev server (for fast iteration with HMR) and the Express server (for WebSocket signaling).

Running both on the same port is not possible. If we use separate ports (e.g., Vite on 3000, Express on 3001), the client code would need to detect the environment and connect to different WebSocket endpoints, creating maintenance complexity and potential bugs.

## Decision

**Use Vite's built-in proxy to route WebSocket traffic to Express during development.**

- Vite dev server runs on port 3000
- Express server runs on port 3001
- Vite is configured to proxy `/ws` requests to `ws://localhost:3001`
- Client code always connects to `ws://${window.location.host}/ws` in all environments

Development workflow uses `concurrently` to start both servers with a single command.

## Consequences

**Positive:**
- Identical client WebSocket code for development and production
- No environment detection logic needed in client code
- Works seamlessly when testing from mobile devices on the same network
- Single command (`npm run dev`) starts both servers

**Negative:**
- Slightly more complex Vite configuration
- Extra dependency (`concurrently`) for development
- Proxy adds minimal overhead in development

## Alternatives Considered

1. **Environment variable detection**: Client checks `import.meta.env.DEV` and uses different ports. Pros: No proxy needed. Cons: Build-time environment detection may not work for mobile testing, requires Vite configuration.
2. **Port detection**: Client checks if hostname is localhost and port is 3000, then uses 3001. Pros: No proxy. Cons: Fails for mobile testing where localhost is not the serving host.
3. **Separate development setup**: Develop without WebSocket, only test in production. Pros: Simpler. Cons: Cannot test connection flow during development.
