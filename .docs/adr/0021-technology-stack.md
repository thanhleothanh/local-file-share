# 21. Technology Stack

**Status**: Accepted  
**Date**: 2026-06-03

## Context

The application needs a complete technology stack covering server, client, shared types, build tooling, testing, and linting. With WebSocket signaling and streaming file transfers, the stack needs to support TypeScript, a component model for the UI, and a monorepo structure for shared types.

## Decision

### Server

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js | Ubiquitous, Docker-friendly, native WebSocket support |
| HTTP server | Node.js `http` module | No framework needed — serves static files + WebSocket on same port |
| WebSocket | `ws` library | Minimal, well-tested, no framework dependency |
| Language | TypeScript | Type safety, shared types with client |
| Entry point | Single `server/index.ts` | Started with `npm run start` |

### Client

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| UI framework | Lit (ADR-0022) | Lightweight Web Components, TypeScript-native, ~5KB |
| Language | TypeScript | Type safety, shared types with server |
| Build tool | Vite | Fast dev server, Lit plugin, production Rollup builds |
| Styling | CSS3 (scoped via Shadow DOM) | No CSS framework needed for this scope |

### Shared

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Types | TypeScript interfaces in `packages/shared/` | Single source of truth for message protocol |
| Package manager | npm workspaces | Native monorepo support, no extra tooling |

### Testing

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Unit/Integration | Vitest | Vite-native, fast, TypeScript support |
| E2E | Playwright | Real browser testing, WebRTC support |
| Linting/Formatting | Biome | Single tool for both, ~35x faster than ESLint+Prettier |

### Deployment

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Container | Docker (multi-stage) | Single image: server + client static files |
| Base image | `node:20-alpine` | Small, secure |
| Port | 3000 (single) | Server serves static files + WebSocket |

### Project Structure

```
local-file-share/
├── packages/
│   ├── shared/          ← shared TypeScript types
│   │   ├── src/
│   │   └── package.json
│   ├── server/          ← Node.js + ws signaling server
│   │   ├── src/
│   │   └── package.json
│   └── client/          ← Lit + Vite browser app
│       ├── src/
│       ├── public/
│       ├── index.html
│       └── package.json
├── package.json         ← npm workspaces root
├── tsconfig.base.json   ← shared TypeScript config
├── biome.json           ← linting + formatting config
├── vitest.config.ts     ← test config
├── Dockerfile           ← multi-stage build
└── .docs/               ← ADRs and context documents
```

### Dev Workflow

- `npm run dev` — starts both server (port 3000) and client dev server (port 5173) in parallel
- Vite proxies WebSocket connections from `localhost:5173/ws` to `localhost:3000`
- Hot module replacement for client code
- Server restarts on changes (via `tsx watch`)

## Consequences

**Positive:**
- TypeScript everywhere — type safety across server/client/shared
- Shared types — message protocol defined once, compiler catches mismatches
- Fast development loop — Vite HMR + Vitest watch mode
- Small bundle — Lit (~5KB) + no heavy framework dependencies
- Single Dockerfile — reproducible builds, one container to deploy
- Biome — fast linting + formatting in a single tool

**Negative:**
- Build step required for both server (tsc) and client (Vite)
- Monorepo adds complexity over a single-package layout
- Lit has a smaller ecosystem than React/Vue (fewer community components)
- Biome is newer than ESLint — fewer plugins available

## Alternatives Considered

1. **Express + `ws`**: Full web framework for server. Cons: Overkill for static files + WebSocket relay.
2. **Fastify + @fastify/websocket**: Schema validation, faster. Cons: Slightly more complex than plain `http` + `ws`.
3. **React/Vue**: Larger ecosystem. Cons: Heavier bundle (~40KB+ runtime), more complex for this scope.
4. **Vanilla TypeScript**: No framework. Cons: Manual DOM management, ~200-300 lines of boilerplate.
5. **webpack/esbuild**: Alternative bundlers. Cons: Vite is faster for dev, has native Lit support.
6. **ESLint + Prettier**: Established linting/formatting. Cons: Two tools, slower than Biome.
7. **pnpm/yarn**: Alternative package managers. Cons: npm is native, sufficient for this scope.
8. **Single-package layout**: Simpler structure. Cons: No clean separation between shared/server/client.

## Related Decisions

- WebSocket Signaling Server (ADR-0019) — server technology
- Lit Frontend Framework (ADR-0022) — client framework
- No File Size Limit / Streaming (ADR-0002) — storage backend determines client capabilities
