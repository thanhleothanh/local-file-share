# 22. Lit Frontend Framework

**Status**: Accepted  
**Date**: 2026-06-03

## Context

The client-side UI needs a component model for the Connection tab (device list, connected device) and Files tab (file list, progress bars, accept/reject buttons). With TypeScript and a need for reactive updates (real-time progress, device list changes, file state transitions), a lightweight framework reduces boilerplate and improves maintainability.

## Decision

Use **Lit** as the frontend framework for the browser application.

Lit provides:
- **Web Components** with Shadow DOM for style encapsulation
- **Reactive properties** — update a property, the DOM re-renders automatically
- **Template syntax** — `html` tagged template literals for declarative rendering
- **TypeScript-native** — first-class TS support, decorators for `@customElement` and `@property`
- **~5KB** bundle size (gzipped)
- **No runtime dependency** — compiled away at build time by Vite

### Component Structure

```
client/src/
├── components/
│   ├── connection-tab.ts      ← device list, connected device, disconnect
│   ├── files-tab.ts           ← file list, send button, empty state
│   ├── file-row.ts            ← single file transfer row (progress, accept/reject)
│   ├── device-row.ts          ← single device in the list
│   ├── toast-notification.ts  ← toast message component
│   └── app-shell.ts           ← top-level layout, tab switching
├── services/
│   ├── websocket-client.ts    ← WebSocket connection to signaling server
│   ├── webrtc-manager.ts      ← WebRTC peer connection management
│   ├── file-transfer.ts       ← chunked file streaming
│   ├── file-system-writer.ts  ← File System Access API (primary)
│   ├── indexeddb-writer.ts    ← IndexedDB fallback
│   └── queue-manager.ts       ← send queue management
├── types/
│   └── index.ts               ← local types (re-exports from shared)
├── main.ts                    ← entry point
└── styles/
    └── global.css             ← CSS custom properties, base styles
```

### Key Patterns

**Component communication:** Props down, events up. Parent passes data via properties, children emit custom events.

**State management:** No external store. State lives in `app-shell.ts` (connection state, device list) and is passed down to child components. File transfer state is managed by services and reflected in component properties.

**Styling:** CSS custom properties for theming (`--accent`, `--error`, `--success`). Shadow DOM scopes styles per component. Global styles are minimal (base font, layout).

## Consequences

**Positive:**
- Declarative rendering — no manual DOM manipulation for list updates, progress bars, state changes
- Style encapsulation — no CSS leaks between components
- Small bundle (~5KB) — negligible overhead
- TypeScript-first — full type safety in templates and properties
- Web Standards — components work outside Lit if needed

**Negative:**
- Smaller ecosystem than React/Vue — fewer community components and examples
- Learning curve for decorators and tagged template literals
- Shadow DOM can complicate third-party CSS integration (not a concern for this app)

## Alternatives Considered

1. **Vanilla TypeScript**: No framework. Cons: Manual DOM updates, ~200-300 lines of boilerplate for list rendering and state management.
2. **React**: Largest ecosystem. Cons: ~40KB+ runtime, JSX requires build step, heavier than needed.
3. **Vue**: Good balance. Cons: ~30KB runtime, single-file components require plugin support.
4. **Svelte**: Compiler-based, no runtime. Cons: Requires Svelte-specific build tooling, smaller ecosystem.
5. **Preact**: React-compatible, ~3KB. Cons: Compatibility layer adds complexity, still React paradigm.

## Related Decisions

- Technology Stack (ADR-0021) — overall stack choices
- Unified Files Tab (ADR-0018) — UI layout the components implement
- Connection Tab — device list UI the components implement
- Toast Notifications (ADR-0024) — toast component
