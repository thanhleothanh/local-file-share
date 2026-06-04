# Issue 0005 — Connect / Accept / Reject with ConnectionStateMachine

## Parent

Derived from `.docs/prds/0007-state-machines-queue-and-lifecycle.md` (ConnectionStateMachine portion) and `.docs/prds/0003-signaling-server.md` (ConnectRequestHandler, AcceptConnectHandler, RejectConnectHandler, DisconnectHandler).

## What to build

The end-to-end connection flow: a user clicks Connect on a device, the target sees an accept/reject prompt, both sides transition through the 3-state connection model (IDLE → CONNECTING → CONNECTED → IDLE). The `ConnectionStateMachine` is the authoritative state-transition logic; the UI and signaling are wired through it. Busy state is enforced server-side: if Device A is connected to Device C, Device B cannot request-connect to A.

## Acceptance criteria

- [ ] `ConnectionStateMachine` exposes `transition(currentState, event)` as a pure function; throws `InvalidTransitionError` on illegal transitions
- [ ] Transition table: IDLE+REQUEST_CONNECT→CONNECTING; CONNECTING+CONNECT_ACCEPTED→CONNECTED; CONNECTING+CONNECT_REJECTED→IDLE; CONNECTING+PEER_CANCELLED→IDLE; CONNECTING+ERROR→IDLE; CONNECTED+DISCONNECT→IDLE; CONNECTED+ERROR→IDLE
- [ ] Stateful wrapper: `dispatch(event)` applies the transition and emits a `transition` event
- [ ] Server-side `ConnectRequestHandler` checks `registry.isBusy(target)`; if busy, sends `connect-rejected` to the requester; otherwise forwards `connect-request` to the target
- [ ] Server-side `AcceptConnectHandler` marks `connectedTo` on both devices and broadcasts the updated `device-list` (so all clients see them as busy)
- [ ] Server-side `RejectConnectHandler` does not mark busy; broadcasts the updated `device-list` (so the requester sees the target as free again)
- [ ] Server-side `DisconnectHandler` clears `connectedTo` on both devices and broadcasts
- [ ] Client-side: clicking Connect sends `request-connect`; target device's `ConnectionTab` shows a prompt with Accept and Reject buttons
- [ ] Client-side: target accepting sends `accept-connect`; both UIs transition to "Connected" state and show the connected device name prominently
- [ ] Client-side: target rejecting sends `reject-connect`; both UIs return to the device list
- [ ] A "Cancel" button is shown while in CONNECTING (waiting for accept/reject); clicking it sends `disconnect` to the server and transitions back to IDLE
- [ ] A "Disconnect" button is shown while in CONNECTED; clicking it sends `disconnect` and transitions back to IDLE
- [ ] In CONNECTED state, the device list is hidden; only the connected device card with a Disconnect button is shown
- [ ] E2E test: open two contexts; A clicks Connect on B; B sees the prompt; B accepts; both show "Connected to [name]"; A clicks Disconnect; both return to the device list
- [ ] E2E test: open three contexts A, B, C; A connects to B (B is now busy); C clicks Connect on B; C sees "B is busy" toast; B's device list still shows C as available
- [ ] Unit tests cover the full transition table (8 valid transitions + all other state×event pairs throw) and the three new server handlers

## Blocked by

- 0003 (Connection tab UI exists; we add behavior to it)

## User stories covered

- PRD-0007 stories 1-2, 9 (ConnectionStateMachine portion)
- PRD-0003 stories 6-9 (connect request/accept/reject/busy)
- PRD-0008 stories 5-9 (connection flow UI)
