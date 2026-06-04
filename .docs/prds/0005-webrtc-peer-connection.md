# PRD 0005 — WebRTC Peer Connection

## Problem Statement

Two devices on the same network need a direct peer-to-peer channel for file data, established via WebRTC. The connection must use two data channels (control and data), apply SCTP backpressure to prevent the data channel from silently closing mid-transfer, and be transportable across the signaling server. Without a clean abstraction, the data channel mechanics leak into the file transfer code and the backpressure logic gets reinvented per caller.

## Solution

A `WebRTCConnection` class owns the `RTCPeerConnection` lifecycle. An `IceExchange` module serializes and dispatches ICE candidates. A `DataChannelFactory` creates the two data channels with the right options. A `SCTPBackpressure` decorator wraps the data channel's `send` method with the `bufferedamountlow` pacing primitive. A `DataChannelSender` and `DataChannelReceiver` provide the minimal interface that file transfer code needs.

## User Stories

1. As a user, I want to click a device and have a WebRTC connection establish in the background, so that the Files tab activates.
2. As a user, I want the connection to use two separate data channels (control and data), so that control messages are never blocked by large data chunks.
3. As a developer, I want SCTP backpressure on the data channel, so that the channel does not silently close when the receiver is slow.
4. As a developer, I want the connection to be established in a single `connect(targetDeviceId)` call, so that the UI does not manage SDP/ICE exchange.
5. As a developer, I want ICE candidates to be relayed via the signaling server, so that connection establishment works on real networks.
6. As a user, I want connection establishment to fail fast if the peer is unreachable, so that I do not wait indefinitely.
7. As a developer, I want a 60-second safety timeout on the backpressure wait, so that a stalled channel does not hang the sender forever.
8. As a user, I want the WebRTC connection to survive a temporary server disconnect, so that file transfers are not interrupted by server blips.
9. As a developer, I want the data channel to be reliable + ordered (no `maxRetransmits: 0`), so that chunks are never silently dropped.
10. As a user, I want the connection to close cleanly when I click Disconnect, so that the other device sees a notification.

## Implementation Decisions

### Module: `WebRTCConnection`
- Constructor takes an `IceExchange` (or signaling channel) and a `DataChannelFactory`
- `connect(targetDeviceId: string): Promise<void>` — creates the `RTCPeerConnection`, sets up the data channels, generates an SDP offer, sends it via the signaling channel, awaits the answer, completes ICE gathering, resolves
- `accept(targetDeviceId: string): Promise<void>` — same as above but answers the offer instead of creating one
- `close()` — sends a `CLOSE` message on the control channel (best-effort), then closes the peer connection
- Events: `state-change`, `data-channel-open`, `data-channel-close`, `error`
- Single responsibility: own the peer connection lifecycle. Does not know about file transfer or messages on the data channels.

### Module: `IceExchange`
- Wraps the signaling server's `offer`, `answer`, `ice-candidate` messages
- `sendOffer`, `sendAnswer`, `sendIceCandidate` — typed methods that send via the WebSocket client
- Listens for incoming offers/answers/ICE candidates from the signaling channel and dispatches them to the active `WebRTCConnection`
- Single responsibility: WebRTC ↔ signaling translation. Does not know about peer connection internals.

### Module: `DataChannelFactory`
- `createControlChannel(peer: RTCPeerConnection): RTCDataChannel` — for the offerer
- `createDataChannel(peer: RTCPeerConnection): RTCDataChannel` — for the offerer; sets `bufferedAmountLowThreshold = 1 MiB`
- `acceptChannels(peer: RTCPeerConnection, onControl: (ch) => void, onData: (ch) => void)` — for the answerer; hooks `ondatachannel` to route to the right consumer
- Single responsibility: create and route the two data channels. Does not know what is sent on them.

### Module: `SCTPBackpressure`
- `wrap(channel: RTCDataChannel): RTCDataChannel` — replaces the `send` method on the channel with a Promise-returning version that resolves only when `bufferedamountlow` fires (or immediately if already drained)
- Implements a 60-second safety timeout: if the channel never drains, the wait resolves with a warning
- Returns the same channel object so callers see no difference
- Single responsibility: pace sends. Does not know about chunks, files, or any caller-specific logic.

### Module: `DataChannelSender`
- Wraps the data channel + `SCTPBackpressure`
- `send(payload: ArrayBuffer | string): Promise<void>` — calls `channel.send` and awaits the drain
- The control channel is NOT wrapped — its messages are tiny and never approach the threshold
- Single responsibility: a single async `send` method. Replaces fire-and-forget with awaitable pacing.

### Module: `DataChannelReceiver`
- Wraps the data channel
- `start(onMessage: (data: ArrayBuffer | string) => void)` — sets `onmessage` and starts emitting parsed events
- `stop()` — clears the handler
- Single responsibility: stream incoming messages to a callback. Does not parse or interpret them.

### Backpressure details
- Threshold: 1 MiB (chosen so 64 chunks are in flight at a time, keeping the pipeline saturated)
- Safety timeout: 60 seconds (the `handleFileReceived` 30s ack timer will catch the worst case)
- The control channel is never wrapped — backpressure on it would add latency for no benefit (JSON messages are < 1 KB)

### Connection establishment flow
1. User clicks Device B in ConnectionTab
2. `WebRTCConnection.connect(B)` is called
3. `createOffer` → SDP offer → sent to B via signaling
4. B's `WebRTCConnection.accept(A)` runs, creates an answer, sends back
5. ICE candidates trickle in via the signaling channel on both sides
6. Both sides emit `data-channel-open` → control and data channels are wired to the file transfer layer (PRD 0006)
7. UI shifts to Files tab

### SOLID application
- **S** — each module has one reason to change: connection lifecycle, ICE translation, channel creation, backpressure, send pacing, receive dispatch
- **O** — adding a new feature (e.g., bandwidth estimation) is a new decorator around the channel; existing modules do not change
- **L** — `DataChannelSender` is substitutable for a raw `channel.send`; callers can `await` it the same way
- **I** — `SCTPBackpressure` exposes a single `wrap` method; `DataChannelSender` exposes a single `send`
- **D** — file transfer code depends on the `DataChannelSender` abstraction, not on `RTCDataChannel` directly

## Testing Decisions

### What makes a good test
- Mock `RTCPeerConnection` and `RTCDataChannel` entirely — these are browser APIs we do not own
- Test the backpressure decorator with synthetic `bufferedAmount` values and a fake event loop
- Test the connection establishment flow with a mock signaling channel that records sends

### Modules to test
- `SCTPBackpressure` — given a channel where `bufferedAmount` starts above the threshold, `send` awaits the `bufferedamountlow` event. Given a channel already drained, `send` resolves immediately. Given a channel that never fires `bufferedamountlow`, the 60s safety timeout resolves (use `vi.useFakeTimers()`).
- `DataChannelSender` — given a wrapped channel, `send("hello")` calls `channel.send` with `"hello"` and returns a promise that resolves after the drain.
- `DataChannelReceiver` — given a channel, `start` sets `onmessage`; emitting a message via the mock channel calls the callback with the right data.
- `DataChannelFactory` — given a mock peer, `createControlChannel` and `createDataChannel` return channels with the right options (especially `bufferedAmountLowThreshold` on the data channel).
- `WebRTCConnection` (integration) — given a mock signaling channel and a mock peer connection, `connect` produces an offer, awaits the answer, completes ICE. `accept` answers an incoming offer. `close` sends a `CLOSE` message and closes the peer.

### Test framework
- Vitest with `vi.useFakeTimers()` for the safety timeout
- No real WebRTC in unit tests — the full flow is exercised by Playwright E2E in PRD 0009

### Prior art
None. Pattern: each test creates a `MockRTCDataChannel` that records calls and exposes an `emit(event, data)` helper to simulate the browser firing events.

## Out of Scope

- The actual file transfer over the data channels (PRD 0006)
- The UI that surfaces connection state (PRD 0008)
- Network address translation traversal beyond the local network (the same-network assumption holds)
- Renegotiation, perfect negotiation, or other advanced WebRTC patterns (not needed for 1:1 LAN)

## Further Notes

- The peer connection is created with no ICE servers — the local network assumption means STUN/TURN are not needed
- `IceExchange` should buffer ICE candidates that arrive before the remote description is set, then flush them after `setRemoteDescription` resolves
- The data channel's `bufferedAmountLowThreshold` must be set at creation time, not later — the property is read-only after `onbufferedamountlow` starts firing
- The control channel is created with the same options as the data channel (reliable, ordered) but without the backpressure wrapper, since its messages are tiny
- `WebRTCConnection.close` is idempotent — calling it twice should not throw
