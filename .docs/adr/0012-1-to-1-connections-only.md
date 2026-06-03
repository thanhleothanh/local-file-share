# 12. 1:1 Connections Only

**Status**: Accepted  
**Date**: 2026-05-31

## Context

A user may want to connect to multiple devices simultaneously for file sharing. However, this adds significant complexity to connection management, UI, and resource usage.

## Decision

Support **only one active connection at a time**. If a user attempts to create a new connection while one is already active, reject with error: "Close current connection first."

## Consequences

**Positive:**
- Simple connection management
- No resource conflicts
- Clear, predictable behavior
- Easy to implement and test

**Negative:**
- Cannot share with multiple devices simultaneously
- User must disconnect/reconnect to switch devices
- Less flexible for team scenarios

## Alternatives Considered

1. **Multiple Connections**: Support N simultaneous connections. Pros: More flexible. Cons: Complex connection management, queue coordination, UI complexity.
2. **Auto-Close Old**: Close existing connection when starting new. Pros: Seamless. Cons: User loses in-progress transfers silently.
3. **Queue Connections**: Queue new connection requests. Pros: User-friendly. Cons: Complex, connections may time out while queued.
