# PRD 0003 — Signaling Server

## Problem Statement

Devices on the same local network must discover each other and exchange WebRTC signaling messages (SDP offers/answers, ICE candidates, connection requests). The server must also track which devices are currently connected to each other so that the UI can disable the Connect button for busy devices. Without a clean server-side architecture, the message-handling code becomes a giant switch statement with implicit state — hard to test, hard to extend with new message types.

## Solution

A Node.js HTTP + WebSocket server on port 3000. The server serves the built client static files on GET and accepts WebSocket connections on the same port. WebSocket messages are dispatched to a `MessageHandler` interface — one implementation per message type. A `DeviceRegistry` holds the single source of truth for device state (id, name, socket, `connectedTo`). The router is a stateless dispatcher. This separation lets each piece be tested in isolation and lets new message types be added without touching existing handlers (Open/Closed).

## User Stories

1. As a device, I want to register with the server on connect, so that I appear in other devices' device lists.
2. As a device, I want to see all other registered devices in real time, so that I can pick one to connect to.
3. As a device, I want my custom device name to be visible to others, so that I can be identified.
4. As a device, I want to send a WebRTC SDP offer to a specific peer, so that a WebRTC connection can be established.
5. As a device, I want ICE candidates to be relayed to the correct peer, so that connection establishment works.
6. As a device, I want to request a connection to a peer, so that the peer sees an accept/reject prompt.
7. As a peer, I want to accept or reject a connection request, so that I control who connects to me.
8. As a device, I want to see which devices are already connected to someone (busy state), so that I do not waste time clicking a busy device.
9. As a device, I want to be notified when a peer disconnects, so that I can clean up my UI.
10. As an operator, I want the server to print its URL on startup, so that I know where to point my browser.
11. As a device, I want a consistent device ID across page reloads, so that I am recognizable.
12. As a server operator, I want the server to handle a client disconnect gracefully, so that the device list stays accurate.

## Implementation Decisions

### Module: `SignalingServer`
- Single class: `start(port: number)`, `stop()`, `getDeviceList(): Device[]`
- Internally: creates an `http.Server`, hooks `ws.WebSocketServer({ noServer: true })` to the HTTP server's `upgrade` event, dispatches incoming WebSocket messages to the router
- Single responsibility: own the HTTP + WS lifecycle. Does not know about message types or device semantics.

### Module: `DeviceRegistry`
- `register(device: Device)`, `unregister(deviceId: string)`, `getAll(): Device[]`, `getById(id: string): Device | null`, `setConnection(aId: string, bId: string | null)`, `isBusy(id: string): boolean`
- Internally: a `Map<deviceId, Device>` plus a per-device `connectedTo` field
- Single responsibility: own the device list. No knowledge of WebSocket or message routing.
- All mutations trigger a `device-list` broadcast via an event emitter so the server can react.

### Module: `SignalingRouter`
- `route(client: WebSocket, message: SignalingMessage)` — looks up the handler for the message type and invokes it
- A `Map<messageType, MessageHandler>` populated at construction
- Stateless. Single responsibility: dispatch.

### Module: `MessageHandler` (interface)
- `handle(client: WebSocket, message: SignalingMessage, registry: DeviceRegistry): void | Promise<void>`
- One implementation per message type — Open/Closed. Adding a new message type means adding a new class, not modifying the router.

### Modules: `RegisterHandler`, `OfferHandler`, `AnswerHandler`, `IceCandidateHandler`, `ConnectRequestHandler`, `AcceptConnectHandler`, `RejectConnectHandler`, `DisconnectHandler`
- One class each, implements `MessageHandler`
- `RegisterHandler` — extracts device id and name, adds to registry, triggers broadcast
- `OfferHandler` / `AnswerHandler` / `IceCandidateHandler` — look up the target device, forward the message
- `ConnectRequestHandler` — checks `isBusy(target)`, forwards the request if free, sends a `connect-rejected` back if busy
- `AcceptConnectHandler` / `RejectConnectHandler` — mark `connectedTo` on both sides, forward response
- `DisconnectHandler` — remove from registry, trigger broadcast

### Server startup output
```
Server running at http://192.168.1.100:3000
Local network URL: http://192.168.1.100:3000
```
The first line is always present. The second uses the LAN IP, looked up at startup (the same address the other devices should hit).

### Protocol summary
- Envelope: `{type, from, to?, data}` over WebSocket text frames
- Client→server types: `register`, `offer`, `answer`, `ice-candidate`, `request-connect`, `accept-connect`, `reject-connect`, `disconnect`
- Server→client types: `device-list`, `offer`, `answer`, `ice-candidate`, `connect-request`, `connect-accepted`, `connect-rejected`, `device-disconnected`

### SOLID application
- **S** — `DeviceRegistry` is the only module that knows the device list exists; `SignalingRouter` is the only module that knows message types exist
- **O** — adding a new message type adds a new handler class; the router and registry do not change
- **L** — any handler is substitutable; the router treats them all identically
- **I** — `MessageHandler.handle` is a minimal interface (one method)
- **D** — `SignalingServer` depends on the `DeviceRegistry` and router, not on the concrete `Map` or message-switch internals

## Testing Decisions

### What makes a good test
- Test the server's external behavior: send a message on a `ws` client, assert the response
- Use real WebSocket connections against the server (start it on an ephemeral port for the test)
- Each handler is tested in isolation with a mocked `DeviceRegistry`
- Assert the right side effects: registry calls, forwarded messages, broadcasts

### Modules to test
- `DeviceRegistry` — `register` then `getAll` returns it; `setConnection(a, b)` then `isBusy` returns true for both; `unregister` removes it
- `SignalingRouter` — given a mock handler for type `foo`, sending a `foo` message invokes it; unknown type throws
- `RegisterHandler` — given a mock registry and mock client, asserts `registry.register` was called with the right shape, and that a `device-list` is broadcast
- `OfferHandler` — given a registry with two devices A and B, sending an `offer` from A to B asserts the message is forwarded to B's socket (and not to A's)
- `ConnectRequestHandler` — happy path: target not busy, `connect-request` is forwarded to target; busy path: target busy, `connect-rejected` is sent back to the requester
- `DisconnectHandler` — unregister is called, a `device-disconnected` is broadcast
- `SignalingServer` (integration) — start the server, connect two `ws` clients, register both, verify the second receives the first's `device-list`. Send a `request-connect` from A to B, verify B receives `connect-request` and A receives `connect-accepted` after B accepts.

### Test framework
- Vitest for all tests
- `ws` client for integration tests (same library the server uses, so we test the actual wire format)
- No E2E in this PRD

### Prior art
None. The pattern: each handler test mocks the registry and client, asserts one call. Integration tests start the real server on port 0 and use real `ws` clients.

## Out of Scope

- Static file serving of the built client (added later when the client is built; the server already accepts arbitrary HTTP GETs and can be wired to a static file middleware in PRD 0012)
- Authentication, encryption, or access control (local network trust assumption)
- Persistence of the device list across server restarts
- WebRTC connection itself (the server only relays signaling; the actual RTCPeerConnection lives in PRD 0005)
- Device name uniqueness enforcement (server does not dedupe names)

## Further Notes

- The server is single-threaded by design — no need for locks or atomics on the registry
- A device that disconnects (TCP close) should be treated identically to a `disconnect` message: both remove from registry
- The `connectedTo` field is server-side state — clients receive it as part of the `device-list` payload and do not need to compute it themselves
- The server's `getDeviceList` method exists for tests only; the server itself pushes updates via WebSocket
- The protocol envelope is JSON-only — no binary frames on the signaling channel
