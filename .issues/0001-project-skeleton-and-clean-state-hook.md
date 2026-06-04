# Issue 0001 — Project Skeleton & Clean-State Hook

## Status

Done — 2026-06-04. Skeleton runs end-to-end (`npm run dev` starts both server and Vite), `npm run build` produces server + client artifacts, `npm run test` runs 48 unit tests, `npm run lint` is clean, Dockerfile is in place, and the clean-state hook is unit-tested.

## Parent

Derived from `.docs/prds/0001-foundation-and-build-system.md` and `.docs/prds/0012-clean-state-production-build-and-deployment.md`.

## What to build

Set up the monorepo skeleton and prove it runs end-to-end. `npm run dev` starts the server (port 3000) and the Vite dev server (port 5173) together. The Vite server proxies `/ws` to `:3000` so the browser can talk to the signaling server during development. The server serves a minimal "Local File Share — coming soon" HTML page on every GET. The client is an empty Vite + Lit app that loads and displays that page. On page load, the client runs a clean-state hook that wipes all IndexedDB databases matching `LocalFileShare*` and all `lfs:*` localStorage keys (except `lfs:deviceName`).

## Acceptance criteria

- [x] Root `package.json` declares npm workspaces pointing to `packages/{shared,server,client}`
- [x] `tsconfig.base.json` extends strict mode (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- [x] `packages/shared/` contains `Constants` (chunk size, timeouts, queue caps), `MessageTypes`, `ControlMessageTypes`, `FileState`, `ConnectionState`, `ChunkCodec`, `Uuid`, `Logger` modules with full type coverage
- [x] `packages/server/` has a single `index.ts` that starts a Node.js `http` server on port 3000 and returns "Local File Share — coming soon" for every GET
- [x] `packages/client/` is a Vite + Lit app that loads and renders an `<app-shell>` element
- [x] `vite.config.ts` proxies `/ws` → `ws://localhost:3000`
- [x] `npm run dev` starts both processes; opening `http://localhost:5173` shows the page; opening `http://localhost:3000` shows the same page
- [x] `npm run build` produces `packages/server/dist/index.js` and `packages/client/dist/`
- [x] `npm run test` runs Vitest with the shared-module unit tests passing (ChunkCodec round-trip, State machine transition tables, Constants assertions)
- [x] `biome check .` passes with no warnings
- [x] On client page load, all `LocalFileShare*` IndexedDB databases are deleted and all `lfs:*` localStorage keys except `lfs:deviceName` are cleared
- [x] `Dockerfile` (multi-stage) builds successfully; image is < 200 MB; `docker run -p 3000:3000` serves the page (skeleton only — full server wiring comes in slice 18)

## Blocked by

None — can start immediately.

## User stories covered

- PRD-0001 stories 1-10
- PRD-0012 stories 1-3 (clean-state hook, no Docker/prod yet)
