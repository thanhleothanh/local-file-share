# Issue 0003 — Connection Tab Renders Device List

## Parent

Derived from `.docs/prds/0008-ui-app-shell-and-connection-tab.md` (UI portion) and `.docs/prds/0011-cross-cutting-concerns.md` (BrowserSupport, DeviceIdentity).

## What to build

The client renders a Connection tab that shows all devices currently registered with the server, with the local device identified. No connection logic yet — only the device list. The Connection tab is the default tab on load. The tab is read-only when the server is disconnected (greyed out, server-disconnected indicator shown). The list updates in real time as devices connect and disconnect.

## Acceptance criteria

- [ ] `AppShell` Lit component renders two tabs (Connection, Files) with the Connection tab active by default
- [ ] `ConnectionTab` renders a `DeviceRow` for each device in the `device-list` payload, plus a "You" row for the local device
- [ ] `DeviceRow` shows the device name and a "Connect" button; the local device's row shows "You" instead of a Connect button
- [ ] The Connect button is disabled if `device.connectedTo !== null` (busy state) — disabled state is visually distinct
- [ ] A subtle dot in the tab header is gray when the WebSocket is connected, amber when not
- [ ] When the WebSocket is disconnected, the device list is greyed out and the Connect buttons are non-interactive
- [ ] When a device disconnects from the server, its row is removed from the list within 1 second
- [ ] When a new device registers, its row appears in the list within 1 second
- [ ] `ConnectionViewModel` exposes reactive `devices` and `serverConnected` state; components subscribe in `connectedCallback` and unsubscribe in `disconnectedCallback`
- [ ] E2E test: open two browser contexts; both register; each context's device list contains the other; the local device has a "You" badge; closing one context removes it from the other within 1 second
- [ ] Unit test: `DeviceRow` renders name and disabled Connect button when busy; `AppShell` renders `ConnectionTab` when `activeTab = 'connection'`; `EmptyState` shows "No devices online" when list is empty
- [ ] All previously passing tests still pass

## Blocked by

- 0002 (WebSocket signaling roundtrip)

## User stories covered

- PRD-0008 stories 1-4, 10, 12
- PRD-0004 stories 3-5 (server disconnection indicator, auto-reconnect shows in UI)
