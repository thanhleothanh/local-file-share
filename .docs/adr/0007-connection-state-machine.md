# 7. Connection State Machine

**Status**: Accepted  
**Date**: 2026-06-03

## Context

A WebRTC connection goes through various states during its lifecycle. We need a clear state machine to manage connection behavior, UI updates, and error handling. File progress is tracked by the file state machine (ADR-0008), not the connection, and errors surface via toast notifications (ADR-0024) rather than dedicated states.

## Decision

Adopt a **3-state connection state machine**:

| State | Description | UI |
|-------|-------------|-----|
| **IDLE** | No active connection | Device list visible, Files tab shows "Connect a device to start sharing files" |
| **CONNECTING** | Connection request sent, waiting for accept/reject | "Waiting for [device] to accept..." with cancel button |
| **CONNECTED** | WebRTC data channels open | Files tab active, send button visible, device list shows connected device |

**Transitions:**
- IDLE → CONNECTING: User clicks a device in the list, server sends `request-connect`
- CONNECTING → CONNECTED: Target accepts, WebRTC signaling completes, data channels open
- CONNECTING → IDLE: Target rejects, user cancels, or timeout
- CONNECTED → IDLE: User disconnects, peer disconnects, idle timeout (10 min), or WebRTC error

**File transfer progress** is tracked separately by the file state machine (ADR-0008) and does not affect the connection state. The connection remains `CONNECTED` during file transfers.

**Error handling** is via toast notifications (ADR-0024). WebRTC errors transition the connection back to `IDLE` and show a toast — there is no `FAILED` state. The user always sees either a working connection or the device list.

**Idle Timer:**
- Starts when entering CONNECTED state
- Resets on any control/data channel message
- Does NOT reset on UI activity (only network activity)
- Expires after 10 minutes → transitions to IDLE

**Server disconnection:**
- If the WebSocket to the signaling server drops, the device list becomes read-only (no new connections possible)
- The existing WebRTC connection stays alive
- A subtle indicator shows the server is disconnected
- Clients auto-reconnect the WebSocket in the background

## Consequences

**Positive:**
- Simple, predictable connection lifecycle — 3 states cover the entire UI
- Easy to debug and test
- File progress and errors are orthogonal concerns handled by their own systems
- No redundant state (TRANSFERRING is a file state, not a connection state)

**Negative:**
- No explicit "failed" or "closed" states — users must infer from UI context (device list reappears, toast message)
- Idle timeout value (10 min) is a fixed constant — too short for some use cases, too long for others

## Alternatives Considered

1. **5-state machine (NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED)**: More granular. Cons: TRANSFERRING duplicates the file state machine, FAILED and CLOSED are visually equivalent to returning to IDLE.
2. **4-state machine (IDLE, CONNECTING, CONNECTED, DISCONNECTING)**: Adds a transition state. Cons: DISCONNECTING is instantaneous — no UI benefit.
3. **Separate timer state**: Track idle timeout as independent flag. Cons: More complex logic, no UI difference.
