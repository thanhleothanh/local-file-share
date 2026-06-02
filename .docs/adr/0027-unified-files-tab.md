# 27. Unified Files Tab

**Status**: Accepted
**Date**: 2026-06-02

## Context

The Files panel is the screen where the user sees what they have sent, what they have received, and what is in flight — the answer to "what is the connection doing?". The panel is asked to do several things at once: surface in-flight transfers (which need user attention), show completed transfers (which the user may want to find again), and provide an entry point to send new files. Each of these has different UI requirements, and designs that surface them all at once become walls of state to scroll past.

Two design constraints are worth calling out up front:

- A completed receive auto-triggers the browser save dialog in the same tick the row becomes complete, because the chunk data is held only in memory and is not persisted. A `Download` button on a completed receive would always fail — there is nothing to re-download from. The button is removed by design.
- The send action needs a stable home. A floating element at the bottom of the panel can overlap content above it on small viewports, and its position depends on where the panel scrolls. The natural place is the Files header.

## Decision

### A. One list, no filters, sorted by `createdAt`

- The Files panel shows a single scrolling list of rows. There is no separate sub-section for sender / receiver / queue, and no filter UI above the list.
- Sort order is newest first by `createdAt`. The list is a history of transfers, not a "what needs attention now" feed — a user looking for a recently failed transfer can scroll, and the chronological order matches the natural reading direction.
- A row does not move on state transitions. A file that just completed sits in the position it was added, not at the top.

### B. Direction, not role

- Every row shows a direction indicator (↑ send, ⬇ receive). This is enough to disambiguate "what is this row about" without a separate panel.
- On a phone, the same panel layout works for the offerer, the answerer, the sender, the receiver — no role-switching.

### C. One progress bar, on the receiver

- A progress bar appears only on receiver rows that are actively receiving. The sender has no real-time progress signal — it does not know how many bytes the receiver has written — so a sender-side bar would be a lie that updates only on completion.

### D. No `Download` button

- A completed receive auto-triggers the browser save dialog in the same tick the row becomes complete. The chunk data is held only in memory and is not persisted, so a re-download action is not possible.
- A user who did not catch the dialog can use the browser's downloads tray.

### E. Send button in the header, hidden until connected

- The Files header shows the panel title and a send action. The send action is a small button at the right end of the header.
- The send action is rendered only when the connection is live. In any other state (pre-connect, disconnecting, closed, failed) it is hidden — there is no peer to send to.
- Hiding the action, rather than disabling it, is intentional: a disabled action asks the user to figure out why it is disabled. A missing action is unambiguous.

### F. Empty state reflects connection state

- The empty state has two variants:
  - Connected, no files: a hint about the send action ("Tap + to send your first file"). The send action is visible.
  - Not connected, no files: a different hint pointing the user at the Connection tab ("Connect a device to start sharing files"). The send action is hidden.

### G. Clear the list on disconnect

- When the connection leaves the live state (transitions to closed or failed), the in-memory file list is cleared. All rows are removed, not just non-terminal ones.
- The reasoning: a new connection is a new session, and seeing the previous session's history under the "no connection" hint is confusing. The next session's empty state is the same as the very first empty state.
- The persistent queue is still cleared on close by the discard-on-close rule. The in-memory UI list is wiped even more aggressively, since the UI is the only surface the user sees.

### H. File selection goes straight to the queue

- File selection is fire-and-forget. The OS file picker collects the user's picks and feeds them straight into the offer/accept flow; the user can always remove a queued file or cancel a pending offer.

## Consequences

**Positive:**
- One screen, one scroll, one list, one button. The model is uniform — every row is a transfer, ordered by when it was added.
- "Where is the file I just completed?" is answered by scrolling up from the bottom of the panel — it sits in the slot it was added in. There is no flicker on completion.
- The send action is structurally part of the header; no fixed positioning, no overlap with the Connection panel, no z-index issues.
- Hiding the send action until the connection is live makes the panel honest about the available actions.
- Clearing the list on disconnect gives each new connection a clean slate.

**Negative:**
- A user who wants to find a recent completed file has to scroll past in-flight transfers. With a typical session of 5–10 files this is fine; with 50+ files it may be a friction point. The auto-download on completion mitigates this in practice.
- The list is history, not work queue. A user who wants "what needs my attention right now" has to scan for incoming offers and in-flight transfers, both of which have prominent status indicators.
- Clearing the list on disconnect removes the ability to review the previous session's history. Users who want history are directed to the browser's download tray (for completed receives, where the file was auto-saved) and the auto-download dialog.
- A file that fails while the user is scrolling will not jump to the top. The status label and accent colour make failed rows scannable, but it is a deliberate consequence of "history, not work queue".

## Alternatives Considered

1. Three panels (Sender / Receiver / Queue). Cluttered; no global view of the connection. Rejected.
2. One list with filter chips. The chips were unused in practice, the partition added UI complexity, and a row jumping to the top on completion was jarring. Rejected.
3. Sort by completion or termination time for terminal states. A row jumping to the top on completion is a visible event the user did not request. Rejected.
4. Sender progress bar driven by a guessed estimate. Misleading. Rejected.
5. Keep the `Download` button but wire it to a re-trigger of the save dialog using a cached blob URL. Would require keeping the data alive until the user clicks — a memory leak waiting to happen. Rejected.
6. Disable the send button when not connected, rather than hide it. A disabled button invites "why can't I click this?" confusion; a missing button is unambiguous, and the empty-state hint already explains what's needed. Rejected.
7. Keep the file list visible after disconnect, but render it as read-only. A stale list under a "no connection" hint is confusing. A clean slate per session is simpler. Rejected.
8. Restore a preview step ("3 files ready, Send all?") between the picker and the queue. Adds a state for an ephemeral moment; the immediate queue is simpler. Rejected.

## Related Decisions

- File State Machine (ADR-0011) — the seven states are still the source of truth; the UI no longer groups them
- 500MB File Limit (ADR-0005) — the in-memory data for auto-download is bounded by this
- 1:1 Connections (ADR-0017) — both peers see the same Files panel, which is why the layout has to be role-agnostic
- Discard Queued on Close (ADR-0018) — the persistent queue is cleared on disconnect; this ADR adds a stricter rule that the in-memory UI list (including completed rows) is also cleared
- File Received Ack and Nack (ADR-0025) — the protocol for file transfer is unchanged
