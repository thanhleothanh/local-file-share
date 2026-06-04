# Issue 0002 — WebSocket Signaling Roundtrip

## Parent

Derived from `.docs/prds/0003-signaling-server.md` and `.docs/prds/0004-websocket-client-and-device-discovery.md`.

## What to build

Two clients connect to the server over WebSocket, register as devices, and the server broadcasts a `device-list` to all clients. The round-trip is verified by console logs (no UI yet). `DeviceRegistry` holds the canonical device list, `SignalingRouter` dispatches messages, and `RegisterHandler` is the only message handler implemented in this slice. The client-side `WebSocketClient` connects on load, sends `register` with its identity, and logs incoming `device-list` messages to the console.

## Acceptance criteria

- [ ] Server's `SignalingServer` accepts WebSocket upgrades on the same HTTP server (port 3000)
- [ ] `DeviceRegistry` exposes `register`, `unregister`, `getAll`, `getById` with a `connectedTo` field
- [ ] `SignalingRouter` dispatches incoming messages to a handler looked up by `type`
- [ ] `RegisterHandler` is the only handler registered in this slice; other types return an "unknown handler" log
- [ ] On `register`, the server adds the device to the registry and broadcasts the new `device-list` to all clients
- [ ] Server prints `[INFO] device registered: {deviceId} {deviceName}` and `[INFO] device-list broadcast (N devices)` on each event
- [ ] `WebSocketClient` (client-side) opens the WebSocket to `/ws` on `connectedCallback`
- [ ] On `open`, the client sends `{type: 'register', from: deviceId, data: {name: deviceName}}`
- [ ] On receiving a `device-list` message, the client logs `console.info('[WebSocketClient] device-list', devices)` to the devtools console
- [ ] `DeviceIdentity.getOrCreate()` returns the same UUID across reloads (persisted in `lfs:deviceId`); `DeviceNamer.generate()` returns "Mobile #1" or "Desktop #1" on first call
- [ ] Two browser tabs (or two Vitest-integration tests) can each register, and each sees the other in the broadcast `device-list`
- [ ] Closing one tab removes it from the other tab's `device-list` within 1 second
- [ ] Unit tests cover `DeviceRegistry` (register/get/unregister, `isBusy` returns false initially), `SignalingRouter` (dispatches to handler by type), `RegisterHandler` (calls `registry.register` and triggers broadcast), and `MessageParser` (every known type parses; malformed input throws)
- [ ] Integration test starts the server on an ephemeral port, opens two real `ws` clients, asserts the second receives the first's `device-list` after both register

## Blocked by

- 0001 (project skeleton)

## User stories covered

- PRD-0003 stories 1-3, 10-12
- PRD-0004 stories 1-2, 6-7, 9-10
