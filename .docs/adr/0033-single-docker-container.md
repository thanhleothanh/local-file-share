# 33. Single Docker Container for Application Deployment

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: None

## Context

The application consists of two logical components:
- A web client built with Vite, serving the static frontend
- An Express server with WebSocket support for signaling

Previously, these would require separate processes to be managed manually: first building the client with `npm run build`, then starting the server with `npm run start`. This creates friction for deployment and requires users to manage multiple processes.

## Decision

**Couple the client and server into a single Docker container** that:

1. Runs `npm run build` to build the client application
2. Starts the Express server that serves the built static files from `dist/`
3. Runs the WebSocket signaling server on the same HTTP server

The container listens on port 3000 by default and serves both the static application and WebSocket connections.

## Consequences

**Positive:**
- Single command to start the entire application
- No manual process management required
- Consistent deployment across environments
- Simplified user experience (run container, access via IP:3000)

**Negative:**
- Cannot develop client and server independently without rebuilding
- Larger container size (includes Node.js + build tools)
- Build step adds to container startup time

## Alternatives Considered

1. **Separate containers**: Client in Nginx container, server in Node container. Pros: Independent scaling, smaller images. Cons: More complex deployment, requires orchestration.
2. **Server-only container + external build**: Build client separately, mount `dist/` into container. Pros: Faster container startup. Cons: Extra build step outside container, less reproducible.
3. **Pure client-side with external signaling**: Keep client browser-only, use external signaling server. Pros: No server to manage. Cons: Violates local-only requirement, adds infrastructure dependency.
