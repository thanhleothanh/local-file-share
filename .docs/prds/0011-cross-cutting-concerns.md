# PRD 0011 — Cross-Cutting Concerns

## Problem Statement

Several concerns cut across all the modules built so far: a central error handler that funnels every error into a single place, logging that produces consistent structured output, browser feature detection that gates storage backend selection, and device identity (UUID + name) that is shared by the WebSocket client and the UI. Without extracting these into standalone modules, the same error handling logic gets duplicated in every catch block, and logging format drifts across the codebase.

## Solution

Five small, focused modules. `ErrorHandler` is the central funnel for all caught errors, routing them to toasts (PRD 0010) with the right severity. `Logger` produces structured log output with timestamps and module names. `BrowserSupport` detects the FSA API, the user agent category, and the available counter for device naming. `DeviceIdentity` and `DeviceNamer` are reused from PRD 0004 but get a final pass here to ensure they are used consistently. All five modules are depended on by every other module — they sit at the foundation layer with the constants and types from PRD 0001.

## User Stories

1. As a developer, I want every caught error to funnel through one `ErrorHandler.handle(error)` call, so that the toast notification is consistent.
2. As a user, I want to see a toast for every error that affects the user, so that I am not left wondering why something failed.
3. As a developer, I want logs to be structured (timestamp, level, module, message, data), so that I can debug issues quickly.
4. As a developer, I want a single `Logger` interface used everywhere, so that the format is consistent.
5. As a developer, I want a single source of truth for "does this browser support FSA?", so that the storage backend decision is consistent.
6. As a user, I want my device identity (UUID + name) to be available from the moment the app loads, so that I am in the device list immediately.
7. As a developer, I want the device name to be auto-generated from the user agent, so that I do not have to type it.
8. As a user, I want my custom device name to persist across reloads, so that I do not have to retype it.
9. As a developer, I want errors to be classified by severity (LOW, MEDIUM, HIGH, CRITICAL), so that the right UI surface is used.
10. As a developer, I want the error handler to never throw, so that a bug in the error reporting path does not crash the app.

## Implementation Decisions

### Module: `ErrorHandler`
- Singleton: `ErrorHandler.getInstance()`
- `handle(error: AppError, context?: string): void` — classifies by severity, routes to the right surface:
  - `LOW` — log only, no UI
  - `MEDIUM` — log + `toast('info', ...)`
  - `HIGH` — log + `toast('error', ...)`
  - `CRITICAL` — log + `toast('error', ...)` + close the connection + clear local state
- `wrap<T>(fn: () => Promise<T>, context: string): Promise<T | null>` — convenience: catches and routes, returns null on error
- Never throws. If the toast fails, logs to console and continues.
- Single responsibility: own the error reporting funnel. Does not know about specific error types — callers classify.

### Module: `Logger`
- Singleton: `Logger.getInstance()`
- `debug(module, message, data?)`, `info(module, message, data?)`, `warn(module, message, data?)`, `error(module, message, data?)`
- Format: `[ISO timestamp] [LEVEL] [module] message { data }`
- Output: `console.debug`, `console.info`, `console.warn`, `console.error` (browsers route these to devtools)
- Level filtering: configurable via `Logger.setLevel(level)` — defaults to `info` in production, `debug` in development
- Single responsibility: produce structured logs. Does not know about errors or toasts.

### Module: `BrowserSupport`
- `hasFileSystemAccess(): boolean` — `'showSaveFilePicker' in window`
- `isMobile(): boolean`, `isTablet(): boolean`, `isDesktop(): boolean` — derived from `navigator.userAgent`
- `getOrdinal(kind: 'mobile' | 'tablet' | 'desktop'): number` — reads/writes the counter in `localStorage` (used by `DeviceNamer`)
- `getUserAgent(): string` — for tests
- Single responsibility: detect browser features and user agent category. Used by storage backend selection (PRD 0002) and device naming (PRD 0004).

### Module: `DeviceIdentity`
- `getOrCreate(): Promise<{deviceId: string, deviceName: string}>` — reads from `localStorage` if present, otherwise generates a fresh UUID and a name from `DeviceNamer`
- `setName(name: string): Promise<void>` — updates the persisted name
- `getName(): string` — synchronous accessor
- `getId(): string` — synchronous accessor
- Persistence: `localStorage` keys `lfs:deviceId` and `lfs:deviceName`. Note: per ADR-0025, these are wiped on page load EXCEPT for `lfs:deviceName`, which is the user preference.
- Single responsibility: persistent device identity. Used by `WebSocketClient` (PRD 0004) and the connection UI (PRD 0008).

### Module: `DeviceNamer`
- `generate(): Promise<string>` — inspects `navigator.userAgent`, picks the right kind, returns the next ordinal
- `kinds(): {mobile: number, tablet: number, desktop: number}` — read the current counters (for tests and the "edit name" UI)
- Single responsibility: name generation. `DeviceIdentity` decides what to do with the result.

### Severity classification
- `LOW` — recoverable, no user impact (e.g., a single chunk NACK round)
- `MEDIUM` — user should know but no action needed (e.g., peer disconnected, server temporarily disconnected)
- `HIGH` — operation failed, user should retry (e.g., file transfer failed, no devices online after timeout)
- `CRITICAL` — connection broken, local state corrupted (e.g., WebRTC error, IndexedDB quota exceeded)

### SOLID application
- **S** — each module has one reason to change: error reporting, logging, feature detection, identity, naming
- **O** — adding a new severity level or a new log destination (e.g., a remote logger) is a new branch in the existing module
- **L** — `Logger` is substitutable behind a `LogSink` interface; a future "send logs to server" implementation would implement the same interface
- **I** — each module exposes a small focused interface; callers depend only on the methods they need
- **D** — call sites depend on the `ErrorHandler`, `Logger`, and `DeviceIdentity` abstractions, not on `console`, `localStorage`, or `navigator` directly

### Integration with the rest of the app
- `WebSocketClient` (PRD 0004) uses `DeviceIdentity` for the `register` payload
- `FileActionsViewModel` (PRD 0009) uses `ErrorHandler.wrap` around every async operation
- `WebRTCConnection` (PRD 0005) uses `ErrorHandler.handle` on RTCPeerConnection errors
- Every module uses `Logger.info(module, ...)` for significant events
- `StorageBackendFactory` (PRD 0002) uses `BrowserSupport.hasFileSystemAccess`

## Testing Decisions

### What makes a good test
- Test the error handler with a mock toast function — assert the right severity calls `toast` with the right type
- Test the logger with a captured `console.info` — assert the format includes the timestamp, level, module, and data
- Test the device identity with a mocked `localStorage`
- Test the device namer with various user agent strings

### Modules to test
- `ErrorHandler` — given an `AppError` with severity `HIGH`, calls `toast('error', message)`. Given `CRITICAL`, also closes the connection. Never throws, even if the toast function throws.
- `Logger` — given `info('MyModule', 'hello', {foo: 1})`, the captured `console.info` output includes the ISO timestamp, `INFO`, `MyModule`, `hello`, and `{foo: 1}`. `setLevel('warn')` filters out `debug` and `info`.
- `BrowserSupport` — given a mocked `window` with `showSaveFilePicker`, returns `true`. Given various user agents, returns the right kind.
- `DeviceIdentity` — given a clean `localStorage`, `getOrCreate` returns a new id and a generated name. Given a populated `localStorage`, returns the persisted values. `setName` updates the persisted name.
- `DeviceNamer` — given `navigator.userAgent` containing "iPhone", returns "Mobile #N" where N is the next ordinal.

### Test framework
- Vitest with `vi.useFakeTimers()` and `vi.stubGlobal('navigator', ...)` for browser feature detection

### Prior art
None. Pattern: each test mocks the dependency surface (`console`, `localStorage`, `navigator`, `toast`) and asserts on the call to the public API.

## Out of Scope

- The actual error generation in other modules (those use `ErrorHandler` but the errors originate in their own code)
- A remote logging service (logs stay in `console` for now)
- Error analytics or aggregation
- Crash reporting

## Further Notes

- The `AppError` type is a tagged union: `{kind: 'NetworkError', message}` | `{kind: 'StorageQuotaError', ...}` | `{kind: 'WebRTCError', ...}` | etc. The `ErrorHandler` switches on `kind` to decide severity.
- The device name is generated on first call. Subsequent calls return the persisted name from `localStorage`.
- The ordinal counter is per-kind and per-origin. Two browsers on one device get two distinct names.
- `Logger.setLevel` is called once at app startup based on `import.meta.env.DEV` (Vite's environment variable).
- `ErrorHandler.handle` is the only function that knows about the severity levels. Callers just pass an `AppError`; the handler decides the surface.
- The error handler is intentionally a singleton — it is used everywhere, and a single instance ensures the same logging and toast routing behavior.
