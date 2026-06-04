# PRD 0008 — UI: App Shell & Connection Tab

## Problem Statement

The user must see the device list, see when a connection is being established, accept or reject incoming connection requests, and disconnect from an active peer. The Files tab is a separate concern (PRD 0009). Without a clean separation between the tab-level layout and the connection-specific UI, the component tree becomes coupled and the connection logic leaks into the tab-switching machinery.

## Solution

A top-level `AppShell` component owns the layout and tab switching (between Connection and Files tabs). A `ConnectionTab` component renders the device list, the connecting prompt, and the connected device UI. A `DeviceRow` component renders a single device. The components are "dumb" — they receive state as properties and emit events upward. All state lives in a `ConnectionViewModel` that wires together the `WebSocketClient` (PRD 0004), the `ConnectionStateMachine` (PRD 0007), and the `WebRTCConnection` (PRD 0005).

## User Stories

1. As a user, I want to see a Connection tab and a Files tab, so that I can switch between finding devices and sharing files.
2. As a user, I want the Connection tab to show all currently online devices, so that I can pick one to connect to.
3. As a user, I want the Connect button to be disabled for devices that are already connected to someone, so that I do not waste time.
4. As a user, I want a subtle indicator when the server is disconnected, so that I know why the device list is frozen.
5. As a user, I want to see a "Connecting..." prompt with a Cancel button when I initiate a connection, so that I can back out.
6. As a peer, I want to see an accept/reject prompt when someone wants to connect, so that I control who connects to me.
7. As a connected user, I want to see the connected device's name prominently, so that I know who I am sharing with.
8. As a connected user, I want a Disconnect button, so that I can end the connection when done.
9. As a user, I want my device name to be editable inline, so that I can identify myself to others.
10. As a user, I want the tab to be read-only while the server is disconnected, so that I do not click on stale data.
11. As a user, I want the tab-switching to be fast and not shift the layout, so that the UI feels stable.
12. As a user, I want the Connection tab to be the default tab on load, so that I land on the device list.

## Implementation Decisions

### Module: `AppShell`
- Top-level component: renders the tab bar, the active tab's content, and the toast container (PRD 0010)
- State: `activeTab: 'connection' | 'files'`, `connectionState` (from the `ConnectionViewModel`)
- The Files tab is hidden until a connection is established (or shown but disabled, depending on UX decision — see "Further Notes")
- Single responsibility: layout and tab switching. Does not know about devices, files, or WebRTC internals.

### Module: `ConnectionTab`
- Renders three sub-states based on `connectionState`:
  - `IDLE` → device list with Connect buttons
  - `CONNECTING` → "Waiting for [device] to accept..." prompt with Cancel
  - `CONNECTED` → connected device card with Disconnect
- Also renders the server-disconnected indicator at all times
- Single responsibility: render the connection flow. Does not know about WebRTC internals — it just reflects state.

### Module: `DeviceRow`
- Renders a single device: name, edit-name button (for the current device only), Connect button (disabled if busy or self)
- Emits `connect-clicked` event upward
- For the current device, shows an "Edit" button instead of a Connect button
- Single responsibility: render a single device row. Does not know about the device list or connection state.

### Module: `EmptyState`
- Renders the empty-state message ("No devices online" or "Connecting..." or "No active connection")
- Receives the message text and an optional icon
- Reused by `ConnectionTab` and `FilesTab` (PRD 0009)
- Single responsibility: render an empty-state message. No state.

### Module: `ConnectionViewModel`
- Wires together the `WebSocketClient`, `ConnectionStateMachine`, `WebRTCConnection`, and `DeviceIdentity`
- Exposes reactive state: `devices`, `connectionState`, `connectedDeviceId`, `serverConnected`
- Methods: `connectToDevice(deviceId)`, `acceptConnection(fromDeviceId)`, `rejectConnection(fromDeviceId)`, `disconnect()`, `setDeviceName(name)`
- Single responsibility: orchestrate the connection flow. The UI components depend on this — not on the lower-level modules directly (Dependency Inversion).

### Server-disconnected indicator
- Small dot in the connection tab header
- Gray when connected, amber when not
- Tooltip: "Server disconnected — reconnecting..." (no user action required)

### Empty state messages
- Server disconnected + devices cached: "Server disconnected"
- IDLE + no devices: "No devices online"
- IDLE + devices: device list
- CONNECTING: "Waiting for [device] to accept..."
- CONNECTED: connected device card

### Inline device name editing
- The current device's row in the list has an "Edit" button next to the name
- Clicking it swaps the name for an input with auto-focus
- Enter or blur saves the new name via `ConnectionViewModel.setDeviceName`
- Escape cancels

### Tab visibility
- Files tab is always visible in the tab bar, but disabled (greyed out) when not connected
- Tabs do not shift when content changes (no inline alert banners — those moved to toasts in PRD 0010)
- Active tab is highlighted with an accent color

### SOLID application
- **S** — `AppShell` does layout, `ConnectionTab` does connection flow, `DeviceRow` does a single row
- **O** — adding a new connection flow (e.g., a QR fallback) adds a new component; existing components do not change
- **L** — `EmptyState` is reusable across tabs without modification
- **I** — `DeviceRow` exposes one event (`connect-clicked`); it does not need to know about accept/reject
- **D** — UI components depend on `ConnectionViewModel` (an abstraction), not on `WebSocketClient` or `WebRTCConnection` directly

## Testing Decisions

### What makes a good test
- Test the UI via Playwright E2E — full browser, real DOM, real WebSocket against a local server
- Unit-test the `ConnectionViewModel` with mocked lower-level modules — assert it calls the right methods on the right events
- Visual regression testing is out of scope; manual review is sufficient for now

### Modules to test
- `ConnectionViewModel` (unit, Vitest) — given a mock `WebSocketClient` emitting a `device-list-updated` event, the view model exposes the new list. Given a `connectToDevice` call, it sends the right `request-connect` message. Given a `disconnect` while connected, it closes the WebRTC connection and transitions the state machine to `IDLE`.
- `AppShell` (unit, Vitest with `happy-dom`) — given `activeTab = 'connection'`, renders the `ConnectionTab`. Given a click on the Files tab, fires a `tab-changed` event with the new tab.
- `DeviceRow` (unit, Vitest with `happy-dom`) — given a device, renders the name. Given a click on Connect, fires `connect-clicked`. Given the device is busy, the Connect button is disabled.
- `ConnectionTab` (unit, Vitest with `happy-dom`) — given `connectionState = IDLE` and a device list, renders the list. Given `CONNECTING`, renders the prompt. Given `CONNECTED`, renders the connected card.
- Full flow (E2E, Playwright) — start the server, open two browser contexts, verify the device list shows the second device, click Connect, accept on the other side, verify both UIs shift to the Files tab, click Disconnect, verify both return to the device list.

### Test framework
- Vitest for unit tests (with `happy-dom` for DOM operations)
- Playwright for E2E tests (with two browser contexts to simulate two devices)

### Prior art
None. Pattern: each component test mounts the component, queries the DOM, and asserts on the rendered output. The view model test wires mocks and asserts on the orchestration calls.

## Out of Scope

- The Files tab UI (PRD 0009)
- Toast notifications (PRD 0010) — the toast container is rendered by `AppShell` but the toast logic is in a separate PRD
- The actual WebRTC connection establishment (PRD 0005)
- Mobile-specific responsive layout beyond what Lit's Shadow DOM provides by default
- Accessibility audit (focus management, ARIA roles for the tab bar) — listed in Further Notes

## Further Notes

- The `FilesTab` is rendered but disabled (greyed out) when no connection is active. Some teams prefer to hide it entirely; the disabled state is more discoverable.
- The `Edit` button for the current device's name should be visually distinct from a regular device row — a small "You" badge or different background.
- Disconnect should show a confirmation dialog if files are in progress (per ADR-0023) — that confirmation is owned by the `ConnectionViewModel`, not the tab component.
- Accessibility: tab bar should use `role="tablist"`, tabs should be `role="tab"`, panels should be `role="tabpanel"`, arrow keys should navigate between tabs. This is not implemented in this PRD but should be in a follow-up.
- Lit's reactive properties handle the state updates: when the `ConnectionViewModel` emits a change, components re-render automatically. No manual DOM manipulation.
- The `ConnectionViewModel` is a class with a `subscribe(callback)` method that returns an unsubscribe function — components subscribe in `connectedCallback` and unsubscribe in `disconnectedCallback` to avoid leaks.
