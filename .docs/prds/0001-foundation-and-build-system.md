# PRD 0001 — Foundation & Build System

## Problem Statement

The application is greenfield — `src/` is empty. Before any feature code can be written, we need a working monorepo with TypeScript everywhere, a shared types package, build tooling, linting, and test infrastructure. Without this foundation, every subsequent PRD is blocked on environmental setup, and type drift between server, client, and shared code would corrupt the message protocol.

## Solution

A monorepo with three packages (`shared`, `server`, `client`) wired through npm workspaces. TypeScript is configured at the root with a shared `tsconfig.base.json`. Vite powers the client dev server with a WebSocket proxy to the server. Vitest runs unit tests, Playwright runs E2E. Biome handles linting and formatting in one tool. A single multi-stage Dockerfile produces the production image. No code is written for features in this PRD — only the skeleton and tooling.

## User Stories

1. As a developer, I want `npm run dev` to start the server and client together, so that I can develop without juggling multiple terminals.
2. As a developer, I want Vite to proxy WebSocket traffic from `:5173/ws` to `:3000`, so that the browser can talk to the signaling server during development.
3. As a developer, I want TypeScript strict mode everywhere, so that type mismatches between server, client, and shared code fail at build time.
4. As a developer, I want Vitest to run all unit tests with a single command, so that I can verify the test suite quickly.
5. As a developer, I want Playwright configured for E2E tests, so that I can later test the full WebRTC + UI flows in real browsers.
6. As a developer, I want Biome to format and lint on save, so that style is consistent without manual effort.
7. As a developer, I want a `packages/shared/` directory for protocol types, so that the server and client agree on message structure.
8. As a maintainer, I want a single multi-stage Dockerfile, so that the production build is reproducible and one image contains the full app.
9. As a developer, I want hot module replacement for the client, so that UI changes show up without a full reload.
10. As a developer, I want the server to restart automatically on file changes (`tsx watch`), so that I do not have to restart it manually.

## Implementation Decisions

### Module: `Constants` (foundation)
Single source of truth for magic numbers. Exports `CHUNK_SIZE` (16384), `BUFFERED_AMOUNT_LOW_THRESHOLD` (1 MiB), `BACKPRESSURE_SAFETY_TIMEOUT_MS` (60000), `ACK_TIMEOUT_MS` (30000), `IDLE_TIMEOUT_MS` (600000), `MAX_NACK_ROUNDS` (3), `FSA_QUEUE_FILE_COUNT_CAP` (100), `IDB_QUEUE_SIZE_CAP_BYTES` (1 GB). Used by every layer above.

### Module: `MessageTypes` (foundation)
TypeScript interfaces for all WebSocket signaling messages between server and client (the JSON envelope `{type, from, to, data}` and the typed payload union). One file, no logic.

### Module: `ControlMessageTypes` (foundation)
TypeScript interfaces for control channel JSON messages (`FILE_OFFER`, `FILE_ACCEPT`, `FILE_REJECT`, `TRANSFER_DONE`, `FILE_RECEIVED`, `CHUNK_ACK`, `CHUNK_REQUEST_NACK`, `CANCELLED`, `CLOSE`).

### Module: `FileState` (foundation)
Enum and transition table for the 7 file states (PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED). Pure data, no behavior. Used by `FileStateMachine` (PRD 0007).

### Module: `ConnectionState` (foundation)
Enum for the 3 connection states (IDLE, CONNECTING, CONNECTED). Pure data. Used by `ConnectionStateMachine` (PRD 0007).

### Module: `ChunkCodec` (foundation)
Encode and decode the 41-byte binary chunk header. Pure functions. `encode(fileId: string, index: number, isLast: boolean): ArrayBuffer` and `decode(buffer: ArrayBuffer): {fileId, index, isLast, data}`. Validates minimum length.

### Module: `Uuid` (foundation)
Generates v4 UUIDs using the Web Crypto API. Single function. Used by both client (device ID, file IDs) and server (connection IDs).

### Module: `Logger` (foundation, but used in 0001)
Tiny structured logger with levels (debug, info, warn, error). Wraps `console` with timestamps and module name prefix. Single interface: `logger.info(module, message, data?)`.

### Build & Tooling
- `package.json` at root with workspaces pointing to `packages/*`
- `tsconfig.base.json` with strict, ES2022 target, NodeNext modules
- `tsconfig.json` per package extending base
- `vite.config.ts` in `packages/client/` with proxy `/ws → ws://localhost:3000`
- `vitest.config.ts` at root, runs all `*.test.ts` files
- `playwright.config.ts` at root, single chromium project
- `biome.json` at root with rules covering both server and client
- `Dockerfile` multi-stage: build stage compiles server + builds client, runtime stage copies artifacts into `node:20-alpine`
- `.dockerignore`, `.gitignore` for `node_modules`, `dist`, etc.
- Root scripts: `dev`, `build`, `test`, `test:e2e`, `lint`, `format`

### Package Layout
```
packages/
├── shared/   ← Constants, MessageTypes, ControlMessageTypes, FileState, ConnectionState, ChunkCodec, Uuid
├── server/   ← empty entry stub returning "not implemented" HTTP 200
└── client/   ← empty Vite app showing "Local File Share — coming soon"
```

### SOLID application
- Each module has one responsibility (data, encoding, or generation)
- `ChunkCodec` is open for extension (new header fields) but closed for modification of existing fields
- `MessageTypes` and `ControlMessageTypes` define small focused interfaces — clients depend only on the message types they handle (Interface Segregation)
- `Uuid` is the only module that knows about crypto.randomUUID — others depend on the abstraction

## Testing Decisions

### What makes a good test
- Test external behavior (function output given input), not implementation details
- No mocking of `Math`, `Date`, or `crypto.randomUUID` — use them directly
- One assertion per test where possible; multiple only when the assertions are facets of the same behavior

### Modules to test
- `Constants` — single test asserting each named constant matches its ADR-decided value (catches accidental changes)
- `ChunkCodec` — round-trip tests: encode then decode returns the same `{fileId, index, isLast, data}`. Edge cases: empty data, max index, isLast true/false, malformed buffer (< 41 bytes throws)
- `FileState` — tests that all valid transitions are present in the transition table (exhaustive enumeration of state × event pairs)
- `ConnectionState` — same exhaustive test
- `Uuid` — uniqueness test over 10,000 generations
- `Logger` — capture console output, verify format and level routing

### Test framework
- Vitest for all unit tests
- Tests live in `tests/unit/` mirroring module structure, or co-located as `*.test.ts`
- Coverage target: 100% for these pure modules (they're cheap to cover)

### Prior art
None — this is the first set of tests in the repo. The pattern will be: `describe('ModuleName', () => { it('does X', () => { ... }) })` with no mocks, no DI containers, no test doubles.

## Out of Scope

- Any feature code (no signaling, no WebRTC, no file transfer, no UI components)
- CI configuration (GitHub Actions, etc.)
- Release versioning or changelog
- Documentation beyond what is in the ADRs

## Further Notes

- `tsconfig.base.json` should set `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true` to maximize type safety
- Vite proxy is critical for dev — without it, the browser cannot reach the WebSocket server
- The Dockerfile should use multi-stage builds to keep the final image under 200 MB
- Biome's rules should match the ADRs — no unused imports, no `any`, no `console.log` in production code (use `Logger` instead)
