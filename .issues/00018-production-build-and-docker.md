# Issue 00018 — Production Build + Docker

## Parent

Derived from `.docs/prds/0012-clean-state-production-build-and-deployment.md` (Docker, production server portion).

## What to build

Wire the production server to serve the built client static files and accept WebSocket connections on the same port (3000). Create a multi-stage Dockerfile that produces a self-contained image under 200 MB. Verify the production build works end-to-end via `docker build` + `docker run`. Add a `docker-compose.yml` for local production-like development. The server reads `HOST` and `PORT` from environment variables.

## Acceptance criteria

- [ ] Production server (`packages/server/dist/index.js` started with `node`) serves `packages/client/dist/index.html` and all its assets on every GET
- [ ] Production server accepts WebSocket upgrades on the same port and dispatches to the existing `SignalingServer` logic
- [ ] Server reads `PORT` (default 3000) and `HOST` (default `0.0.0.0`) from environment variables
- [ ] Server prints `[INFO] Server running at http://{HOST}:{PORT}` and `[INFO] Local network URL: http://{lanIP}:{PORT}` on startup (the second line uses the LAN IP looked up at startup)
- [ ] `Dockerfile` is multi-stage: build stage (`node:20-alpine`) compiles the server with `tsc` and builds the client with `vite build`; runtime stage copies the artifacts and runs the server
- [ ] Final image is < 200 MB (verified by `docker images local-file-share`)
- [ ] Image runs as non-root user (`node`)
- [ ] `docker-compose.yml` is provided for local production-like development with port mapping
- [ ] `npm run build` produces a self-contained `packages/server/dist/` that can be run with `node packages/server/dist/index.js` and serves the app
- [ ] `npm run start` runs the production server
- [ ] Integration test: build the image, start the container, fetch `/` and assert it returns the HTML shell, open a WebSocket, register a device, assert the server responds
- [ ] E2E test against the production image: open two browser contexts, register, see each other in the device list (this proves the static files are served and the WebSocket proxy is gone)
- [ ] `.dockerignore` excludes `node_modules`, `dist`, `.git`, `.docs`, `tests`, etc.
- [ ] `README.md` at the repo root explains how to run dev, build, and run production (Docker)
- [ ] All previously passing tests still pass

## Blocked by

- 00017 (disconnect + idle are the last feature; production is integration)

## User stories covered

- PRD-0012 stories 4-10
- PRD-0001 stories on Docker and build pipeline
