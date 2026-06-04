# Issue 00017 — Disconnect + Idle Timeout

## Parent

Derived from `.docs/prds/0007-state-machines-queue-and-lifecycle.md` (IdleTimer, queue discard on close) and `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (cancel and disconnect UX).

## What to build

Wire up the disconnect flow and the 10-minute idle timeout. The Disconnect button shows a confirmation dialog if files are currently in progress (TRANSFERRING or QUEUED), kills the connection immediately on confirm, and discards the queue. The idle timer starts when entering CONNECTED, resets on any control or data channel message, and transitions the connection to IDLE after 10 minutes of inactivity. Idle expiry does not show a confirmation — it's silent (per ADR-0007).

## Acceptance criteria

- [ ] `IdleTimer.start()` begins a 10-minute timer; `reset()` cancels and restarts the timer; `stop()` cancels without restarting
- [ ] `ConnectionStateMachine` starts the timer on `CONNECTED`, stops it on `IDLE` (via a side effect on the transition)
- [ ] On any incoming control or data channel message, the timer is reset
- [ ] The Disconnect button on the Files tab is always visible while connected
- [ ] If no file is currently TRANSFERRING or QUEUED, clicking Disconnect closes the connection immediately
- [ ] If a file is TRANSFERRING or QUEUED, clicking Disconnect shows a confirmation dialog: "Files in progress will be discarded. Disconnect?"
- [ ] Confirming the dialog closes the WebRTC connection, sends `disconnect` to the server, and transitions both sides to IDLE
- [ ] On IDLE, the Files tab list is cleared (`FileRegistry.clear()`)
- [ ] On IDLE, the IndexedDB databases for the connection are deleted (fallback path only)
- [ ] On IDLE, the sender's `ChunkCache` is cleared
- [ ] Idle expiry (10 min) transitions to IDLE without confirmation and without a toast (silent)
- [ ] Server-side disconnect: if the WebRTC connection's `iceconnectionstate` becomes `disconnected` or `failed`, the connection is treated as if the user clicked Disconnect
- [ ] E2E test: A and B connect; A starts a 1 GB file transfer; A clicks Disconnect; confirmation appears; A confirms; both sides return to IDLE; both Files tabs are empty
- [ ] E2E test: A and B connect; no activity for 10 minutes (fake timers); both sides return to IDLE without user action; no toast
- [ ] E2E test: A and B connect; A sends a small file; A's timer resets on each incoming control message (verified by fake timers not firing)
- [ ] Unit test: `IdleTimer` with `start()` then `vi.advanceTimersByTime(9 * 60 * 1000)` does not fire; advancing to 10 min fires `timeout`; `reset()` cancels
- [ ] Unit test: `ConnectionStateMachine` side effect on `CONNECTED` starts the timer; on `IDLE` stops it
- [ ] All previously passing tests still pass

## Blocked by

- 00015 (Files tab UI exists; we add the Disconnect button and the idle timer)

## User stories covered

- PRD-0007 stories 5, 8
- PRD-0009 stories 11, 13
- PRD-0011 story on the central error handler (server-side disconnect path)
