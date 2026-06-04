# PRD 0004 — WebSocket Client & Device Discovery

## Problem Statement

The browser client must maintain a WebSocket connection to the signaling server, present itself in the device list, react to real-time device list updates, and recover from transient disconnections without disrupting any in-progress WebRTC connection. Without a clean client-side signaling module, connection management leaks into UI components and components become responsible for parsing wire-format messages.

## Solution

A `WebSocketClient` module that owns the WebSocket lifecycle, a `WebSocketAutoReconnect` decorator that handles drops with exponential backoff, and a `MessageParser` that decodes incoming JSON envelopes into typed objects. The client emits high-level events (`device-list-updated`, `incoming-connect-request`, `peer-disconnected`) so the rest of the app does not deal with raw strings. This module is the client-side mirror of `SignalingServer` (PRD 0003) — same protocol, opposite role.

## User Stories

1. As a user, I want the app to connect to the signaling server on load, so that I appear in other devices' lists immediately.
2. As a user, I want my device name to be remembered across page reloads, so that I do not have to retype it.
3. As a developer, I want the WebSocket client to auto-reconnect on disconnect, so that transient network hiccups do not break the app.
4. As a developer, I want the device list to be read-only while the server is unreachable, so that users do not click on stale data.
5. As a user, I want to see a subtle indicator when the server is disconnected, so that I know why the device list is frozen.
6. As a developer, I want the client to send `register` automatically on connect and reconnect, so that the device list stays accurate.
7. As a developer, I want incoming messages to be parsed into typed objects, so that handlers do not need to validate JSON shape.
8. As a user, I want my device name to be auto-generated from my browser (e.g., "Mobile #1") and editable, so that I can identify myself.
9. As a user, I want my device to be assigned a stable UUID across reloads, so that I am recognizable.
10. As a developer, I want the client to expose a single `send(message)` method, so that components do not need to know about WebSocket internals.

## Implementation Decisions

### Module: `WebSocketClient`
- Constructor takes a URL and an event emitter target
- Methods: `connect()`, `disconnect()`, `send(message: SignalingMessage): void`, `on(event, handler)`, `off(event, handler)`
- Events: `connected`, `disconnected`, `device-list-updated`, `incoming-connect-request`, `peer-disconnected`, `server-disconnected` (transient), `server-reconnected` (recovered)
- Internally: owns the `WebSocket` instance, manages the `register` handshake on connect, forwards parsed messages to event handlers
- Single responsibility: own the WebSocket lifecycle. Does not know about WebRTC, UI, or business logic.

### Module: `WebSocketAutoReconnect`
- Wraps `WebSocketClient` (composition, not inheritance) — `WebSocketAutoReconnect` holds a reference to the inner client
- On `disconnected`, schedules a reconnect with exponential backoff: 1s, 2s, 4s, 8s, max 30s
- On reconnect, the inner client re-`register`s automatically
- Emits `server-disconnected` immediately and `server-reconnected` once a `register` succeeds
- Single responsibility: reconnect policy. No knowledge of messages or business logic.

### Module: `MessageParser`
- `parse(raw: string): SignalingMessage` — `JSON.parse` + runtime type guard
- Throws on malformed input; callers (router) catch and log
- Pure function — testable in isolation
- Single responsibility: wire format → typed object. The router decides what to do with the result.

### Module: `DeviceIdentity`
- `getOrCreate(): {deviceId: string, deviceName: string}` — reads from `localStorage` if present, otherwise generates a fresh UUID and a name from `DeviceNamer`
- `setName(name: string)` — updates the persisted name
- Single responsibility: persistent identity. The WebSocket client depends on this for the `register` payload.

### Module: `DeviceNamer`
- `generate(): string` — inspects `navigator.userAgent` to detect mobile/tablet/desktop, returns the next available ordinal (e.g., "Mobile #1", "Mobile #2")
- Pure: no storage. The ordinal counter is held in `localStorage` so reloads do not cause collisions across browsers
- Single responsibility: name generation. `DeviceIdentity` decides what to do with the result.

### Module: `BrowserSupport`
- `hasFileSystemAccess(): boolean` — synchronous `if ('showSaveFilePicker' in window)` check
- `isMobile(): boolean` — derived from user agent
- `getOrdinal(kind: 'mobile' | 'tablet' | 'desktop'): number` — reads/writes the counter in `localStorage`
- Single responsibility: feature detection. Used by storage backend selection (PRD 0002) and the namer.

### SOLID application
- **S** — `WebSocketClient` is the only module that knows about WebSockets; `MessageParser` is the only one that knows JSON shape
- **O** — adding a new event type means adding it to the typed event union; existing handlers do not change
- **L** — `WebSocketAutoReconnect` and a future "always-reconnect" variant would be substitutable behind a common interface
- **I** — clients subscribe to the specific events they care about (Interface Segregation); no module is forced to handle `ice-candidate` if it only cares about device list
- **D** — the UI depends on the high-level event emitter, not on the WebSocket

### Server disconnection UX
- Indicator: small dot in the connection tab header (gray when connected, amber when not)
- Device list is grayed out and unclickable while server is disconnected
- WebRTC connection is unaffected (P2P survives the signaling channel's death)

## Testing Decisions

### What makes a good test
- Mock the WebSocket constructor (via dependency injection) so tests do not hit a real server
- Test the parser exhaustively — every message type and every malformed shape
- Test the auto-reconnect timer behavior with `vi.useFakeTimers()`
- One assertion per behavior

### Modules to test
- `MessageParser` — for every message type in the protocol, parse a known JSON string and assert the resulting object matches. Malformed inputs (missing `type`, wrong field types) throw.
- `WebSocketClient` — given a mock `WebSocket` instance, `connect` triggers `new WebSocket(url)`, then on `open` the client sends a `register` message with the identity. Forwarded events fire when the mock calls `onmessage` with valid JSON.
- `WebSocketAutoReconnect` — given a mock client that emits `disconnected`, verify that `connect` is called after 1s, then 2s, then 4s (use fake timers), and that `server-disconnected` / `server-reconnected` events fire at the right moments.
- `DeviceIdentity` — given a clean `localStorage`, `getOrCreate` returns a new id; given a populated `localStorage`, returns the persisted one. `setName` updates the persisted value.
- `DeviceNamer` — given various user agents (mobile Safari, desktop Chrome, iPad), returns the expected kind. Given a `localStorage` with counter 3, returns "Mobile #4".
- `BrowserSupport` — given a mocked `window` with/without `showSaveFilePicker`, returns the right boolean.

### Test framework
- Vitest with `vi.useFakeTimers()` for the reconnect logic
- `happy-dom` for `window` and `localStorage` in unit tests (lightweight; full jsdom is overkill)

### Prior art
None. Pattern: each test wires up the minimal mock surface (a mock WebSocket, a mock localStorage) and asserts the single behavior under test.

## Out of Scope

- The UI that renders the device list and connection status (PRD 0008)
- The WebRTC connection itself (PRD 0005)
- Sending SDP/ICE messages (covered by the same `send` API, but the call sites come later)
- Heartbeat / ping-pong (the signaling server is local; TCP keepalive is sufficient)

## Further Notes

- The auto-reconnect backoff resets to 1s after a successful `register` — important for handling long outages
- The client must not block the UI on disconnect — events fire on the next microtask, no synchronous error propagation
- `DeviceNamer`'s counter is per-kind and per-origin — a user with two browsers on one device gets two distinct names, which is correct
- All events are strongly typed via a discriminated union — handlers can `switch` on the type and the compiler enforces exhaustiveness
