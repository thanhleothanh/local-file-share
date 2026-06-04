# Issue 0009 — SCTP Backpressure (Test-Only)

## Parent

Derived from `.docs/prds/0005-webrtc-peer-connection.md` (SCTPBackpressure portion) and `.docs/prds/0006-file-transfer-protocol.md` (sender pacing).

## What to build

Implement `SCTPBackpressure` as a wrapper around the WebRTC data channel's `send` method. The wrapper returns a Promise that resolves only when `bufferedamountlow` fires (or immediately if the buffer is already drained). A 60-second safety timeout prevents a stalled channel from hanging the sender forever. The control channel is NOT wrapped — its messages are tiny and never approach the threshold. This is a test-only slice: no UI change, no new behavior visible to the user, but a property the system depends on for correctness.

## Acceptance criteria

- [ ] `SCTPBackpressure.wrap(channel)` returns the same channel object with a replaced `send` method that returns a `Promise<void>`
- [ ] When `bufferedAmount >= bufferedAmountLowThreshold`, `send` awaits a `bufferedamountlow` event before resolving
- [ ] When `bufferedAmount < bufferedAmountLowThreshold`, `send` resolves immediately
- [ ] A 60-second safety timeout guards the wait; if the channel never drains, the wait resolves with a `[WARN]` log and sending proceeds
- [ ] The control channel is never wrapped (verified by an assertion in the test that the control channel's `send` is the original)
- [ ] `FileSender.sendFile`'s `reader.onload` becomes `async` and `await`s the wrapped `send` between chunks
- [ ] Unit test: given a mock channel with `bufferedAmount = 2 MiB` (above 1 MiB threshold), `send` returns a pending Promise; firing the `bufferedamountlow` event on the mock resolves the Promise
- [ ] Unit test: given a mock channel with `bufferedAmount = 0`, `send` resolves on the next microtask
- [ ] Unit test: given a mock channel that never fires `bufferedamountlow`, after 60 seconds (fake timers) the Promise resolves with a warning logged
- [ ] Unit test: `FileSender.sendFile` given a 1 MB file and a wrapped mock channel with high `bufferedAmount` produces chunks at a rate bounded by the backpressure events; a wrapped channel with low `bufferedAmount` produces all chunks in rapid succession
- [ ] Stress test: send 100 MB through a wrapped mock channel whose `bufferedAmount` artificially grows; the sender does not produce more than ~64 chunks ahead (the in-flight window at 1 MiB threshold)
- [ ] All previously passing tests still pass

## Blocked by

- 0008 (FSA + progress; sender is now the production sender that will be wrapped)

## User stories covered

- ADR-0017 (backpressure correctness)
- PRD-0005 stories 3, 7
- PRD-0006 story 8
