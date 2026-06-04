# 37. Trickle ICE for WebRTC Signaling

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: ICE candidate handling in ADR-0003

## Context

The original QR-based connection (ADR-0003) used a non-trickle ICE approach: it waited for all ICE candidates to be gathered before packaging them into the QR code payload. This ensured the QR contained complete signaling information but added latency to the connection setup.

With WebSocket signaling, we can send information as soon as it's available, enabling faster connection establishment.

## Decision

**Use trickle ICE: send SDP offer immediately, then stream ICE candidates as they are gathered.**

1. Device A sends SDP offer via WebSocket as soon as it's created
2. Device B receives offer, sets remote description, and begins gathering candidates
3. Both devices send ICE candidates to each other via WebSocket as they are discovered
4. Devices add incoming candidates immediately via `addIceCandidate`

This allows the WebRTC connection to begin establishing while candidates are still being gathered, reducing overall connection time.

## Consequences

**Positive:**
- Faster connection establishment
- More responsive user experience
- Matches modern WebRTC best practices
- Better handling of networks with many candidates

**Negative:**
- More complex error handling for partial candidate sets
- Requires careful ordering of SDP and candidate messages
- Candidate trickling may fail on some older WebRTC implementations

## Alternatives Considered

1. **Non-trickle ICE**: Wait for all candidates before sending offer. Pros: Simpler, matches original QR implementation. Cons: Slower connection setup, worse UX.
2. **Hybrid approach**: Send offer after first candidate, then trickle rest. Pros: Balance of speed and reliability. Cons: More complex logic, arbitrary threshold.
