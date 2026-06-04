# 28. Connection Tab: 3-Step Dot Progress with State-Driven Panes

**Status**: Superseded by [ADR-0031](./0031-websocket-signaling-server.md) and [ADR-0040](./0040-connection-tab-device-list-ui.md)  
**Date**: 2026-06-02

## Context

The Connection tab drives the 2-QR handshake (ADR-0003) that
establishes the WebRTC peer connection (ADR-0002). It needs to tell
the user where they are in the handshake, what to do next, and stay
visually consistent with the M2 Files tab (ADR-0027). Both peers
should see the same progress through the same three states.

## Decision

A single, state-driven screen — no modal, no 3-section stack, no
in-app disconnect. The screen is a function of two independent
axes: which step the device is on, and which role (initiator or
joiner) it is playing.

**Progress bar.** Three dots at the top — Offer → Answer → Connected.
Active steps use the accent colour, completed steps are green, future
steps are muted. The Connected dot is special: when active it is
green with a heartbeat animation (respects `prefers-reduced-motion`).
The intent is "cool = working, warm = live".

**State-driven panes.** Three panes below the progress bar, one
visible at a time, switched by `currentStep` × `connectionRole`:

- **Step 1 — Offer.** Idle shows two big choice cards (Create Offer /
  Scan Offer). Initiator shows the offer QR + a "Proceed to scan
  Answer QR from other device" button. Joiner shows a live camera
  scanner.
- **Step 2 — Answer.** Initiator shows a live camera scanner that is
  _always on_ while the pane is visible — no button to open it.
  Joiner shows the answer QR.
- **Step 3 — Connected.** Two device cards (local with a "You"
  badge; peer as a generic placeholder) + a "Reload the page to
  disconnect" hint. No explicit "Connected" heading — the green
  heartbeating dot is the signal.

**Visual language.** Reuses the Files tab's card background, border
radius, accent colour, and row layout. Icons appear only on choice
cards and device cards, not on action buttons.

**Manual step advance.** The initiator's "Proceed to scan Answer
QR" button is a manual click, not an automatic advance, so the
joiner has a guaranteed window to scan the offer QR before it
disappears.

**No in-app disconnect.** The user ends a session by reloading the
page. A `disconnect` function is kept in the module as a composition
root (teardown + scanner stop + UI reset) for tests and future
programmatic use, but is not on `window`.

**Silent peer-disconnect.** When the WebRTC peer connection reports
failure (the other side reloaded, network died, etc.), the surviving
device's UI snaps back to step 1 immediately and no error dialog
is shown. The other device's UI is the same (a clean reload), so
a "Connection failed" / "ICE negotiation failed" dialog would be
asymmetric and not actionable. The WebRTC manager transitions state
without escalating to `errorHandler`.

**QR rendering.** zxing is called with a 2-module quiet zone and a
400 px default canvas so the modules fill more of the visible area
while staying scannable. A regression test pins the quiet zone.

**Visual language.** Reuses the Files tab's card background, border
radius, accent colour, and row layout, so the two tabs feel like
the same family. Icons appear only on choice cards and device cards,
not on action buttons.

## Consequences

- The peer device card is a placeholder — peer device type is not
  exchanged over the control channel, and adding a new control
  message is out of scope.
- Manual step advance is one extra click but removes a real race
  between the initiator advancing and the joiner scanning.
- The step-2 camera runs continuously while the pane is visible
  (a few seconds of phone battery/LED use).
- The `disconnect` function exists without a UI affordance, by
  design (composition root, not a user action).

## Alternatives Considered

- **3-section stack restyled.** Preserves "see everything at once"
  but doesn't deliver the state-driven, no-modal feel.
- **Auto-advance the initiator** (immediately or after a delay).
  Both create a fragile race with the joiner's scan window.
- **Signaling server / audio side channel** for real-time
  initiator auto-advance when the joiner scans. Violates the
  "no infrastructure, just QR codes" core constraint (ADR-0001,
  ADR-0003).
- **Show error dialogs on peer-disconnect.** Asymmetric with the
  other device's clean reload and not actionable.
- **Add a "Connecting" step between step 2 and step 3.** The
  step-3 dot's heartbeat already conveys "we are live" without
  inflating the state model.

## Related Decisions

- Unified Files Tab (ADR-0027) — design language
- Two-QR handshake (ADR-0003) — protocol being driven
- Connection state machine (ADR-0010) — source of truth for state
- 1:1 connections only (ADR-0017) — why `createConnection()` always
  closes the existing connection first
- zxing-js/browser (ADR-0016) — QR library whose quiet zone we
  override
