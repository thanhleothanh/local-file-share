# Context Map

This document provides an overview of all bounded contexts in the Local File Share application.

## Contexts

| Context | Purpose | Relationships |
|---------|---------|---------------|
| [File Sharing](./0001-CONTEXT-file-sharing.md) | Core file transfer functionality between devices on local network | N/A |

## Technology Stack

- **Server**: Node.js + `ws` (TypeScript)
- **Client**: Lit (TypeScript) + Vite
- **Shared types**: TypeScript interfaces in `packages/shared/`
- **Monorepo**: npm workspaces
- **Testing**: Vitest + Playwright
- **Linting**: Biome
- **Deployment**: Docker (single multi-stage Dockerfile)

## Key ADRs

| ADR | Topic |
|-----|-------|
| 0001 | WebRTC for P2P file transfer |
| 0002 | No file size limit (streaming via File System Access API) |
| 0007 | 3-state connection model (IDLE, CONNECTING, CONNECTED) |
| 0018 | Unified files tab (batch offers, both-side progress) |
| 0019 | WebSocket signaling server |
| 0021 | Technology stack |
| 0022 | Lit frontend framework |
| 0023 | File queue and batch offer flow |
