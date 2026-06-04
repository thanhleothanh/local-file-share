# 40. Connection Tab: Device List UI

**Status**: Accepted  
**Date**: 2026-06-04  
**Supersedes**: ADR-0028 (Connection Tab: 3-Step Dot Progress with State-Driven Panes)

## Context

The WebSocket signaling server (ADR-0031) replaces the 2-QR handshake (ADR-0003) for device discovery. The previous Connection tab UI (ADR-0028) with its 3-step progress bar and QR code scanning is no longer appropriate. We need a new UI that presents the list of online devices and allows users to initiate connections.

## Decision

**Replace the 3-step progress UI with a device list** that shows all online devices and their connection status.

### Device List Display

- Shows all devices connected to the WebSocket server
- Each device appears as a row with:
  - Status indicator (dot): green for online, other states as needed
  - Device name (descriptive random name, see ADR-0035)
  - "You" badge for the user's own device
  - Action button: "Connect" for unconnected devices, "Disconnect" for connected device
- Device list serves as the primary UI for the Connection tab
- Visibility of device list = WebSocket is connected (see ADR-0036)

### Connection Initiation

- Users click "Connect" button on another device's row to initiate a connection
- No confirmation needed from the initiator
- Initiator's UI remains on device list with pending state on target device

### Connection Request Prompt

- When a connection request is received, show a **modal dialog** (see decision from UI discussion)
- Modal contains:
  - Title: "Connection Request"
  - Message: "{requesting device name} wants to connect to you"
  - Two buttons: "Accept" and "Reject"
- Modal blocks interaction with the rest of the UI until dismissed
- Requests timeout after 30 seconds (see ADR-0038)

### Connected State

- Connected device remains in the device list
- Action button changes from "Connect" to "Disconnect"
- No separate "connected view" — device list is always visible
- Both devices see each other with connected status
- 1:1 connections only (ADR-0017) — only one device can be connected at a time

### Visual Language

- Reuses existing card styling from the Files tab
- Uses existing color palette and typography
- Device rows use consistent spacing and layout with file rows

## Consequences

**Positive:**

- Simpler UI with fewer states to manage
- Matches familiar patterns from messaging apps (Discord, Slack)
- No camera required, works on all devices
- Clear visual hierarchy: list of devices, then connect action

**Negative:**

- Loss of explicit progress indication (the 3-step bar was very clear)
- Users must understand the device list concept
- Modal dialogs may be annoying if connection requests are frequent

## Alternatives Considered

1. **3-step progress with device selection**: Keep step structure but select device in step 1. Pros: Familiar to existing users. Cons: More complex, doesn't match new flow.
2. **Separate "Connected" view**: Hide device list when connected, show dedicated connected view. Pros: Cleaner connected state. Cons: More UI states, harder to switch connections.
3. **Toast notifications for requests**: Non-blocking accept/reject. Pros: Less intrusive. Cons: Easy to miss, may expire before user sees.
4. **Inline request acceptance**: Requests appear in device list with buttons. Pros: All in one place. Cons: Clutters device list, less prominent.
