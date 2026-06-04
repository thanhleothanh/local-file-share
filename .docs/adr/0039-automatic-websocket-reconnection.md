# 39. Automatic WebSocket Reconnection with Exponential Backoff

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: None

## Context

WebSocket connections can be interrupted due to network issues, server restarts, or temporary connectivity problems. Without automatic reconnection, users would need to manually refresh the page to restore WebSocket connectivity, resulting in a poor user experience.

Device list visibility serves as the connection status indicator (see ADR-0036): if users see the device list, WebSocket is connected. When disconnected, the device list disappears, leaving users with no clear indication of what happened or how to recover.

## Decision

**Automatically reconnect WebSocket with exponential backoff** when connection is lost.

- Initial reconnection attempt: immediate
- Subsequent attempts: 1s, 2s, 4s, 8s, 16s, 32s (cap at 32 seconds)
- No user interaction required
- Reconnection attempts continue indefinitely until successful

The reconnection logic operates transparently: users see the device list disappear when disconnected and reappear when reconnected, with no additional UI needed.

## Consequences

**Positive:**

- Seamless recovery from temporary connectivity issues
- No manual intervention required from users
- Handles server restarts gracefully (devices reconnect automatically)
- Consistent behavior across all devices

**Negative:**

- No explicit feedback about reconnection attempts
- Persistent reconnection attempts may waste resources if server is permanently down
- Users may not realize they were disconnected and reconnected

## Alternatives Considered

1. **No auto-reconnect**: Users must refresh page. Pros: Simpler, explicit user control. Cons: Poor UX, requires manual action.
2. **Fixed interval reconnect**: Retry every 5 seconds. Pros: Simpler logic. Cons: May overwhelm server, inefficient backoff.
3. **Manual reconnect button**: Show "Reconnect" button when disconnected. Pros: Explicit user control. Cons: Requires user action, worse UX for temporary issues.
4. **Max retry limit**: Stop after N attempts. Pros: Prevents resource waste. Cons: Users stuck if server recovers after limit.
5. **Toast notifications**: Show reconnection status in toasts. Pros: More feedback. Cons: UI clutter, may be annoying.
