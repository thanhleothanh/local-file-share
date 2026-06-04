# PRD 0012 — Clean State, Production Build & Deployment

## Problem Statement

The application stores file chunks, metadata, and connection state in IndexedDB (fallback path) and device identity in localStorage. If the user reloads the page mid-transfer or after a session, leftover state from the previous session could accumulate without a way to clean it up. The application also needs a production build pipeline — a single multi-stage Dockerfile that produces a self-contained image with the server and the built client.

## Solution

A `CleanStateOnLoad` module that runs before the app initializes: delete all IndexedDB databases matching the `LocalFileShare*` pattern, clear all localStorage entries (except the device name), then start fresh. A multi-stage Dockerfile: build stage compiles the server with `tsc`, builds the client with Vite, then a runtime stage copies the artifacts into a `node:20-alpine` image. The server serves the client static files and accepts WebSocket connections on port 3000.

## User Stories

1. As a user, I want the app to start fresh on every page load, so that no leftover data clutters the browser.
2. As a user, I want my device name to be remembered across reloads, so that I do not have to retype it.
3. As a user, I want all in-flight transfers to be discarded on reload, so that the new session starts cleanly.
4. As an operator, I want to run the app from a single Docker image, so that deployment is one command.
5. As an operator, I want the image to be small (< 200 MB), so that it pulls quickly.
6. As an operator, I want the server to print its URL on startup, so that I know where to point my browser.
7. As an operator, I want the app to be reproducible across environments, so that staging and production behave the same.
8. As a developer, I want a `docker-compose.yml` for local development, so that I can run the production image locally.
9. As a developer, I want the build to fail fast on TypeScript errors, so that I do not ship broken code.
10. As a developer, I want the production build to minify and tree-shake, so that the bundle is as small as possible.

## Implementation Decisions

### Module: `CleanStateOnLoad`
- Runs as the first thing in `main.ts` (before any other module initializes)
- `cleanIndexedDB(): Promise<void>` — iterates over `indexedDB.databases()` (where supported) and deletes every database whose name starts with `LocalFileShare`. For older browsers that do not support `databases()`, maintains a list of known names.
- `cleanLocalStorage(): void` — iterates over `localStorage.keys()`, deletes every key starting with `lfs:` EXCEPT `lfs:deviceName` (user preference)
- `run(): Promise<void>` — calls both, then resolves
- Awaits both before calling `app.start()`
- Single responsibility: clean up on load. Does not know about the rest of the app.

### Module: `CleanStateOnLoad` (browser support)
- Modern browsers (Chrome, Edge, Firefox 126+): use `indexedDB.databases()` for enumeration
- Older browsers: maintain a static list of database names (the connection-id pattern means we cannot enumerate, but on a clean slate there is nothing to clean)
- Both code paths are tested

### Production server
- Built with `tsc` to `packages/server/dist/`
- Single entry point: `node packages/server/dist/index.js`
- Serves static files from `packages/client/dist/` on GET
- Accepts WebSocket connections on `ws://host:3000/ws`
- Reads `PORT` from environment (default 3000)
- Reads `HOST` from environment (default `0.0.0.0`)

### Multi-stage Dockerfile
- **Stage 1 (build)**: `node:20-alpine` — installs npm dependencies, compiles server, builds client
- **Stage 2 (runtime)**: `node:20-alpine` — copies the compiled server and the built client, sets the entry point
- Final image size target: < 200 MB
- Runs as non-root user (`node` user from the base image)

### Dev workflow (unchanged from PRD 0001)
- `npm run dev` — starts both server (port 3000) and client dev server (port 5173)
- Vite proxies WebSocket from `localhost:5173/ws` to `localhost:3000`

### Production workflow
- `npm run build` — builds server (`tsc`) and client (`vite build`)
- `npm run start` — runs the compiled server, which serves the built client
- `docker build -t local-file-share .` — produces the production image
- `docker run -p 3000:3000 local-file-share` — runs the container

### Clean-state invariants
- No file chunks, metadata, or queue state survive a reload
- The device list is repopulated from the signaling server on reconnect
- The device name is the only persistent state (user preference)
- All in-progress WebRTC connections are dropped (the browser tears them down on page unload)
- The WebSocket reconnects automatically on reload (handled by PRD 0004's auto-reconnect, but the device list starts empty)

### `CleanStateOnLoad` error handling
- If `indexedDB.databases()` throws, log a warning and continue (best effort)
- If `deleteDatabase` throws (database in use by another tab), log a warning and continue
- The cleanup is best-effort; the app starts even if cleanup fails

### Build pipeline details
- Server: `tsc --project packages/server/tsconfig.json`
- Client: `vite build` (Vite handles TypeScript, Lit, and tree-shaking)
- Lint: `biome check .` (run on pre-commit and in CI)
- Test: `vitest run` (unit), `playwright test` (E2E)

### Dockerfile details
```dockerfile
# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/
RUN npm ci
COPY tsconfig.base.json ./
COPY biome.json ./
COPY packages/ ./packages/
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/packages/server/dist ./server
COPY --from=build /app/packages/server/package.json ./server/
COPY --from=build /app/packages/client/dist ./client/dist
COPY --from=build /app/packages/shared/dist ./shared/dist
RUN cd server && npm ci --omit=dev
WORKDIR /app/server
EXPOSE 3000
USER node
CMD ["node", "index.js"]
```

### `docker-compose.yml` (for local dev with the production image)
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - HOST=0.0.0.0
      - PORT=3000
```

### SOLID application
- **S** — `CleanStateOnLoad` does one thing: clean up. The Dockerfile is a single artifact with two clear stages.
- **O** — adding a new cleanup step (e.g., clear `sessionStorage`) is a new method on `CleanStateOnLoad`; existing call sites do not change.
- **L** — `CleanStateOnLoad` is substitutable behind a `StartupHook` interface; a future "migrate from v1" hook would implement the same interface.
- **I** — `CleanStateOnLoad` exposes one `run()` method; callers do not need to know about IndexedDB vs localStorage.
- **D** — the rest of the app depends on the `run()` abstraction, not on the browser's `indexedDB` or `localStorage` directly.

## Testing Decisions

### What makes a good test
- Test `CleanStateOnLoad` with `fake-indexeddb` and a mock `localStorage` — pre-populate, run cleanup, assert only the device name survives
- Test the Dockerfile by building it (CI step) — assert the image is < 200 MB
- Test the production server boots and serves the static client (integration test)

### Modules to test
- `CleanStateOnLoad` (unit, Vitest) — pre-populate IndexedDB with two databases (one `LocalFileShare-abc`, one `LocalFileShare-def`, one `unrelated`). Pre-populate localStorage with three keys (`lfs:deviceId`, `lfs:deviceName`, `lfs:deviceList`, `unrelated`). Run cleanup. Assert: only `unrelated` IndexedDB and `unrelated` localStorage survive (plus `lfs:deviceName`).
- Production server (integration, Playwright) — start the production server, fetch `/`, assert it returns the HTML shell. Open a WebSocket, register a device, assert the server responds. Close the WebSocket, assert the device is removed.
- Docker build (CI step) — `docker build` succeeds, image is < 200 MB, `docker run` starts the server, the server responds to `curl /`.

### Test framework
- Vitest with `fake-indexeddb` for IndexedDB
- Playwright for the server integration test
- Docker build step in CI (no test code, just a build verification)

### Prior art
None. Pattern: each test pre-populates the storage layer, runs the cleanup, and asserts the surviving state.

## Out of Scope

- HTTPS / TLS termination (assumed to be handled by a reverse proxy in production)
- CI/CD pipeline (GitHub Actions config, etc.) — the build command and the test command are documented, but the pipeline itself is out of scope
- Database migrations (the IndexedDB schema is stable; v2 would be a different app)
- Multi-server deployment (the signaling server is single-instance; HA is not a current goal)
- CDN or static asset caching (the server serves from disk; caching is a future concern)

## Further Notes

- `CleanStateOnLoad` is intentionally aggressive — anything that could leak across sessions is wiped. The only exception is the device name, which is a user preference.
- The device list is intentionally NOT persisted — the user re-selects a device to connect to on each reload. This is a deliberate UX choice: connections are session-scoped, and re-selecting is a small price for clean state.
- The `LocalFileShare*` prefix is the convention for all IndexedDB databases created by the app. Any database not matching the prefix is left alone (in case the user has other apps using IndexedDB on the same origin).
- The Dockerfile is intentionally minimal — no custom health check, no custom entrypoint script. The server's `index.js` is the entry point; the server logs its URL on startup, which is the operator's signal that it's ready.
- The `HOST=0.0.0.0` default is important for Docker — the server must bind to all interfaces to be reachable from outside the container.
- The production build uses `npm ci` (not `npm install`) to ensure reproducible builds from the lockfile.
- The `biome check` step is run in CI but not in the Dockerfile — linting is a developer concern, not a runtime concern.
