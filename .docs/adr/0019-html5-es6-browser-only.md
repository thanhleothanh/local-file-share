# 19. HTML5 + ES6+ for Browser-Only Application

**Status**: Accepted  
**Date**: 2026-05-31

## Context

We need to build a file sharing application that runs entirely in the browser with no server component. The application must work across modern desktop and mobile browsers.

## Decision

Use **HTML5 and ES6+ JavaScript** as the core technologies for building a pure browser-based single-page application.

This means:
- **Markup**: HTML5
- **Styling**: CSS3
- **Logic**: ES6+ JavaScript (classes, modules, async/await, etc.)
- **Single-file deployment**: The application can be distributed as a single HTML file

## Consequences

**Positive:**
- Zero deployment complexity — users just open an HTML file
- No build process required for development (can use CDN for dependencies)
- Works on all modern browsers (Chrome, Firefox, Edge, Safari, iOS Safari, Android Chrome)
- Can be bundled for production optimization if needed
- Full access to browser APIs (WebRTC, IndexedDB, camera, etc.)
- No server costs or maintenance

**Negative:**
- Limited to browser capabilities (no native file system access)
- Cannot use Node.js-specific modules without bundling
- Mobile browsers have memory limitations (addressed by 500MB file limit)
- No TypeScript type safety (unless we add it later)

## Alternatives Considered

1. **React/Vue/Angular Framework**: Use a modern JavaScript framework. Pros: Better structure, component model, state management. Cons: Larger bundle size, build process required, overkill for a focused application.

2. **TypeScript**: Add static typing. Pros: Better developer experience, catch errors early. Cons: Build step required, additional complexity.

3. **Web Components**: Use native web components. Pros: Encapsulated, reusable components. Cons: Less mature ecosystem, browser compatibility concerns.

4. **Electron/Tauri**: Desktop app wrapper. Pros: Native feel, file system access. Cons: Not pure browser, requires installation, defeats the purpose of easy deployment.

## Related Decisions

- Browser-only with no external servers (ADR-0001)
- Single HTML file deployment for ease of use
