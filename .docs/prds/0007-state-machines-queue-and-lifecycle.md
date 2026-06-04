# PRD 0007 — State Machines, Queue & Lifecycle

## Problem Statement

The application has two state machines (connection: 3 states, file: 7 states), a send-side FIFO queue, and an idle timer. These are pure logic — no I/O, no DOM, no WebRTC. Without extracting them into standalone modules, the state-transition logic gets tangled with event handlers, leading to invalid transitions being silently accepted and the queue order being coupled to UI updates.

## Solution

Two pure state machines (`ConnectionStateMachine`, `FileStateMachine`), a `FileQueue` for the send-side FIFO ordering, a `FileRegistry` that holds the in-memory file list, and an `IdleTimer` for the 10-minute timeout. Each module exposes a minimal event-based API and has no I/O dependencies — making them trivially testable and reusable. The state machines are the authoritative source of valid transitions; other modules consult them rather than embedding transition logic.

## User Stories

1. As a user, I want the connection state to move cleanly between IDLE, CONNECTING, and CONNECTED, so that the UI is always accurate.
2. As a user, I want invalid state transitions to be rejected (e.g., cannot go from IDLE directly to CONNECTED), so that bugs surface early.
3. As a user, I want files to be transferred in the order I accept them, so that the queue feels predictable.
4. As a user, I want to see all files in the Files tab (PENDING, QUEUED, TRANSFERRING, COMPLETED, etc.) in one list, so that the connection's activity is visible at a glance.
5. As a user, I want the connection to time out after 10 minutes of no network activity, so that I do not stay connected to a peer that has wandered away.
6. As a user, I want the next queued file to start automatically when the current one completes, so that batch transfers feel seamless.
7. As a user, I want only one file transferring at a time, so that progress is clear and backpressure works.
8. As a user, I want the queue to be discarded when I disconnect, so that stale state does not carry over to a new connection.
9. As a developer, I want the state machines to be exhaustively tested, so that no transition is forgotten.
10. As a developer, I want the queue to skip files in terminal states, so that a partially-completed batch does not stall the connection.

## Implementation Decisions

### Module: `ConnectionStateMachine`
- States: `IDLE`, `CONNECTING`, `CONNECTED`
- Events: `REQUEST_CONNECT`, `CONNECT_ACCEPTED`, `CONNECT_REJECTED`, `PEER_CANCELLED`, `CONNECTION_OPEN`, `DISCONNECT`, `ERROR`
- `transition(currentState, event): {nextState, sideEffects?}` — pure function. Throws on invalid transitions.
- Exposed as a class with `dispatch(event)` for stateful use, or as a pure function for testing.
- Single responsibility: own the connection lifecycle. No knowledge of WebRTC, files, or UI.

### Module: `FileStateMachine`
- States: `PENDING`, `QUEUED`, `TRANSFERRING`, `COMPLETED`, `REJECTED`, `FAILED`, `CANCELLED`
- Events: `ACCEPT`, `REJECT`, `CANCEL`, `START`, `COMPLETE`, `FAIL`
- Same shape: pure transition function + stateful wrapper.
- Single responsibility: own the per-file lifecycle. No knowledge of storage or transport.

### Module: `FileQueue` (send-side)
- Operations: `enqueue(file)`, `dequeue(): File | null`, `peek(): File | null`, `remove(fileId)`, `size()`, `isEmpty()`
- FIFO order, but `startNextFile()` skips any candidate already in a terminal state (safety net)
- `startNextFile()` emits a `next-file` event with the chosen file, or `queue-empty` if none
- The queue is SEND-only: a received file never enters this queue
- Single responsibility: track the order of files to send. No knowledge of WebRTC or storage.

### Module: `FileRegistry` (in-memory file list)
- Operations: `add(file)`, `update(fileId, patch)`, `get(fileId): File | null`, `getAll(): File[]`, `clear()`
- Holds the canonical list shown in the Files tab
- Sorted by `createdAt` descending on read (newest first)
- `clear()` is called on connection close (per ADR-0018)
- Single responsibility: own the file list. No knowledge of state transitions (those happen in `FileStateMachine`) or queue order (that's `FileQueue`).

### Module: `IdleTimer`
- `start()`, `stop()`, `reset()` — `reset` is called on any control/data channel message
- Emits `timeout` after 10 minutes of inactivity
- `IDLE_TIMEOUT_MS = 600000` (10 minutes)
- Does NOT reset on UI activity (only network activity) per ADR-0007
- Single responsibility: own the idle timeout. No knowledge of connection state or file activity.

### Transition tables

**Connection state machine** (per ADR-0007):

| From | Event | To |
|---|---|---|
| IDLE | REQUEST_CONNECT | CONNECTING |
| CONNECTING | CONNECT_ACCEPTED | CONNECTED |
| CONNECTING | CONNECT_REJECTED | IDLE |
| CONNECTING | PEER_CANCELLED | IDLE |
| CONNECTING | ERROR | IDLE |
| CONNECTED | DISCONNECT | IDLE |
| CONNECTED | ERROR | IDLE |
| CONNECTED | (10 min idle) | IDLE |

**File state machine** (per ADR-0008):

| From | Event | To |
|---|---|---|
| PENDING | ACCEPT (no transfer active) | TRANSFERRING |
| PENDING | ACCEPT (transfer active) | QUEUED |
| PENDING | REJECT | REJECTED |
| PENDING | CANCEL | CANCELLED |
| QUEUED | START | TRANSFERRING |
| QUEUED | CANCEL | CANCELLED |
| TRANSFERRING | COMPLETE | COMPLETED |
| TRANSFERRING | FAIL | FAILED |
| TRANSFERRING | CANCEL | FAILED |

### SOLID application
- **S** — each module has one reason to change: connection lifecycle, file lifecycle, queue order, file list, idle timeout
- **O** — adding a new state or event is a change to the transition table only, not the consumers
- **L** — `FileQueue` could be replaced by `PriorityFileQueue` (priority-based) without callers knowing
- **I** — `IdleTimer` exposes `start/stop/reset/timeout`; no module is forced to handle the timer
- **D** — UI components depend on state changes via events, not on the state machine implementation

## Testing Decisions

### What makes a good test
- Test the transition tables exhaustively: for every (state, event) pair, assert either the documented transition or a thrown error
- No mocks needed — these are pure functions
- One assertion per test where possible

### Modules to test
- `ConnectionStateMachine` — 8 valid transitions above are tested individually. All other (state, event) pairs throw `InvalidTransitionError`. The stateful wrapper correctly applies side effects (e.g., starting/stopping the `IdleTimer` on entering/leaving `CONNECTED`).
- `FileStateMachine` — 9 valid transitions above are tested individually. `startNextFile` from a `QUEUED` state transitions to `TRANSFERRING`. `CANCEL` from `TRANSFERRING` goes to `FAILED` (fail-fast).
- `FileQueue` — `enqueue` then `dequeue` returns in FIFO order. `remove(id)` drops a specific file. `isEmpty` is true initially. `startNextFile` skips a file in a terminal state (e.g., `CANCELLED`).
- `FileRegistry` — `add` then `getAll` returns the file. `update` patches fields. `clear` empties the list. `getAll` sorts by `createdAt` descending.
- `IdleTimer` — `start` then `reset` cancels the pending timeout. `start` then waiting 10 minutes (fake timers) emits `timeout`. `stop` cancels a running timer.

### Test framework
- Vitest with `vi.useFakeTimers()` for the idle timer
- No mocks — these are pure modules

### Prior art
None. Pattern: exhaustive transition table tests for the state machines; behavioral tests for the queue and registry.

## Out of Scope

- The UI that renders the state and queue (PRD 0008, 0009)
- The protocol logic that fires events into the state machines (PRD 0006)
- The actual file transfer itself (PRD 0006)
- The WebRTC connection (PRD 0005)

## Further Notes

- The state machines emit a `transition` event with the old state, new state, and event. The UI subscribes to these events and re-renders.
- `FileRegistry` is cleared on every transition out of `CONNECTED` (per ADR-0018) — the cleanup is triggered by the `ConnectionStateMachine`'s side effect, not by the registry itself.
- The `IdleTimer` is owned by the `ConnectionStateMachine` (started on `CONNECTED`, stopped on `IDLE`) — it is not a global timer.
- The queue cap (100 files for FSA, 1 GB for IndexedDB) is enforced by the queue manager, not the queue itself. The queue is a pure data structure.
- The `startNextFile` safety net (skipping terminal-state candidates) is a belt-and-suspenders measure — the caller should already have removed terminal files, but if a file transitions to FAILED mid-dequeue, the queue does not get stuck.
