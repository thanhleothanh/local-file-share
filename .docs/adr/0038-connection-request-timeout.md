# 38. 30-Second Connection Request Timeout

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: None

## Context

When Device A requests to connect to Device B via the WebSocket signaling server, Device B may not be actively using the application, may have navigated away, or may simply not respond.

Without a timeout, Device A would wait indefinitely for a response, creating a poor user experience and potentially leaving the UI in an ambiguous state.

## Decision

**Connection requests expire after 30 seconds.**

- Device A sends `request-connect` to Device B
- If Device B does not send `accept-connect` or `reject-connect` within 30 seconds, Device A treats the request as failed
- Device A's UI returns to the device list with no active request
- If Device B responds after the timeout, the message is ignored and Device A shows a failure indication

## Consequences

**Positive:**
- Predictable user experience with clear failure modes
- No hanging requests or ambiguous states
- Prevents resource leaks from abandoned requests
- Encourages active participation from both users

**Negative:**
- Users have limited time to respond to connection requests
- May require re-attempting if Device B was momentarily distracted
- 30-second window may be too short for some use cases

## Alternatives Considered

1. **No timeout**: Requests remain pending until explicitly accepted or rejected. Pros: Never misses a late response. Cons: Indefinite hanging, poor UX, resource leaks.
2. **Longer timeout** (60s, 120s): More time for response. Pros: More forgiving. Cons: Longer wait for failure feedback.
3. **Shorter timeout** (10s, 15s): Faster failure. Pros: Quick feedback. Cons: May timeout legitimate delayed responses.
4. **Configurable timeout**: User or server can configure. Pros: Flexible. Cons: More complexity, inconsistent behavior.
