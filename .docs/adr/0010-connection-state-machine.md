# 10. Connection State Machine

**Status**: Accepted  
**Date**: 2026-05-31

## Context

A WebRTC connection goes through various states during its lifecycle. We need a clear state machine to manage connection behavior, UI updates, and error handling.

## Decision

Adopt a **5-state connection state machine**:

| State | Description |
|-------|-------------|
| **NEW** | After QR #1 created, before QR #2 scanned |
| **CONNECTED** | Data channels open, no active transfer (idle) |
| **TRANSFERRING** | File transfer in progress |
| **FAILED** | Connection error occurred |
| **CLOSED** | Terminal state, connection closed |

**Transitions:**
- NEW → CONNECTED: QR #2 scanned, data channels open
- CONNECTED → TRANSFERRING: File offered and accepted
- TRANSFERRING → CONNECTED: Transfer completes, queue empty
- TRANSFERRING → TRANSFERRING: Transfer completes, queue not empty (next starts)
- CONNECTED → CLOSED: Idle timeout (5 min in CONNECTED state)
- Any → FAILED: WebRTC error, invalid secret, etc.
- Any → CLOSED: User action, CLOSE message, tab close

**Idle Timer:**
- Starts when entering CONNECTED state
- Resets on any control/data channel message
- Does NOT reset on UI activity (only network activity)
- Expires after 5 minutes → CLOSED

## Consequences

**Positive:**
- Clear, predictable connection lifecycle
- Easy to debug and test
- UI can reflect accurate state
- Idle timeout prevents resource waste

**Negative:**
- Slightly more state management code
- Need to handle state transitions carefully

## Alternatives Considered

1. **More States**: Include IDLE as separate state. Pros: More granular. Cons: Unnecessary complexity.
2. **Fewer States**: Combine CONNECTED and IDLE. Pros: Simpler. Cons: Less precise.
3. **State + Timer Separate**: Track timer independently. Pros: More flexible. Cons: More complex logic.
