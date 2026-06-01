# 27. Unified Files Tab with Filter Chips

**Status**: Accepted
**Date**: 2026-06-01

## Context

The original Files UI (the v1 design) split files across three disjoint panels — "Send files", "Incoming offers", and "Transfer queue" — plus a per-file progress block and a separate "Download" button for completed receives. The intent was to mirror the user mental model of "I'm sending" / "I'm receiving" / "I'm waiting", but the cost was a wall of state to scroll past, no global view of what the connection was doing, and a `Download` button that was always pressed by the user in the same instant it appeared (because completion already triggered a browser save dialog). A subsequent M2 iteration grouped transfers by file-state category; the final design collapses to a single scrolling list of files with three filter chips above it.

In parallel, the FAB that opened the file picker had a real layout bug: it was styled `position: sticky; bottom: 0.5rem;` and so stuck to the bottom of the *viewport* instead of the bottom of the *Files panel* — on mobile it would float over the Connection panel's content as the user scrolled.

## Decision

### A. One list, three filters

- The Files panel shows a single list of rows. There is no separate "sender" or "receiver" sub-section.
- Above the list, three sticky filter chips: **All** / **Active** / **Done**. Each chip shows its count.
- The grouping is the file's *state group*, derived from its state:
  - **Active** = `PENDING` ∪ `QUEUED` ∪ `TRANSFERRING` — anything needing attention or in flight, both directions.
  - **Done** = `COMPLETED` ∪ `FAILED` ∪ `REJECTED` ∪ `CANCELLED` — terminal states.
- The grouping lives on the `FileTransfer` class as `getStateGroup()`, so any new file state has to be consciously placed in one of the two buckets. Unknown states default to `done` (defensive).
- Sort order is the same across both peers (sender rows and receiver rows look the same):
  - **All** / **Done**: most recent event first, using `getLastEventTime()` → `completedAt` ∥ `terminatedAt` ∥ `createdAt`.
  - **Active**: `TRANSFERRING` first, then `PENDING` (offers needing a decision), then `QUEUED`. Within each tier, most recent first.

### B. Direction, not role

- Every row shows a direction indicator (↑ send, ⬇ receive). This is enough to disambiguate "what is this row about" without a separate panel.
- On a phone, the same panel layout works for the offerer, the answerer, the sender, the receiver — no role-switching.

### C. One progress bar, on the right side

- A progress bar appears **only on receiver rows in `TRANSFERRING`**. The sender has no real-time progress signal — it does not know how many bytes the receiver has written to disk — so a sender-side bar would be a lie that updates only on completion.
- The bar is driven by the receiver's local `bytesTransferred` / `size` and updates as each chunk arrives.

### D. No `Download` button

- A completed receive auto-triggers the browser save dialog in the same tick the row flips to `COMPLETED` (the `fileDataComplete` listener calls `createDownloadLink`).
- The chunk data is held only in the assembled `ArrayBuffer` and is not persisted to IndexedDB, so a "Download again" action is not even possible — there is nothing to redownload from. The button would always fail, so it is removed.
- A user who *didn't* catch the dialog can use the browser's downloads tray.

### E. FAB anchored to the panel, not the viewport

- The `.files-panel` is a flex column. The `.file-list` is `flex: 1 1 auto; overflow-y: auto;` — it grows to fill the available height and scrolls internally.
- The `.btn-fab` is a normal block element (`flex: 0 0 auto`) at the end of the panel, **not** `position: sticky`. It always sits at the bottom of the Files panel content, never overlapping the Connection panel.
- On wide screens the panel is constrained to `max-height: calc(100vh - 4rem)` so the two-column layout fits. On mobile the panel is naturally as tall as its content and the page scrolls as one unit.

### F. File selection goes straight to the queue

- The old "preview" step (a modal/panel showing "you picked these files, hit Send to confirm") is removed. File selection is now fire-and-forget into `fileTransferManager.selectFiles({ sendImmediately: true })`. The user can always `Remove` a queued file or `Cancel` a pending offer.

## Consequences

**Positive:**
- One screen, one scroll, one FAB, three filters. The user can see at a glance what is in flight and what is done.
- "How many files do I have in `Done`?" is answered by a number on the chip — no scroll needed.
- The progress bar only appears where it is meaningful. The sender's "Sending…" label is honest about not knowing the percentage.
- The FAB bug is structurally fixed (the panel itself is the scroll container; the FAB is a flex child, not a sticky descendant of `<html>`).
- The `Download` button being gone removes a class of "I clicked Download, why is the file empty?" complaints (it was always racing with the auto-download).
- The list works the same on phone and desktop; no role detection is needed in the UI.

**Negative:**
- The "Active" chip can grow during heavy bursts (e.g. sending 20 files at once). The list scrolls inside the panel, so this is fine in practice.
- A user who dismissed the auto-download dialog has to dig into the browser's download tray to find the file. Acceptable: this is how every other browser-based file transfer works.
- The terminal-state grouping is now baked into the model (`getStateGroup()`). A future state that semantically belongs somewhere else (e.g. `EXPIRED`) will need an explicit decision rather than "where do I put this in the UI".
- The old preview step is gone; users who liked the "review before send" workflow no longer have that affordance. We judge this acceptable because the file picker is OS-native and shows filenames/sizes, and `Remove` / `Cancel` is available post-add.

## Alternatives Considered

1. **Keep three panels (Sender / Receiver / Queue).** Tried, found cluttered. Replaced.
2. **Two panels: "In flight" and "Done"**, no "All". Tempting, but "All" is the only place a user can search history chronologically; we kept it.
3. **Sender progress bar driven by a guessed estimate** (bytes-sent / file-size). Misleading. Rejected.
4. **Keep the `Download` button but wire it to a re-trigger of the save dialog using a cached `Blob URL`.** Would require keeping the `ArrayBuffer` alive until the user clicks — a memory leak waiting to happen. Rejected.
5. **Restore the preview step but inline it as a chip above the list ("3 files ready, Send all?").** Adds a state for an ephemeral moment; the immediate queue is simpler.

## Related Decisions

- File State Machine (ADR-0011) — the `getStateGroup()` partition is defined here in terms of those states
- 7-state File State Machine (ADR-0011) — `terminatedAt` is the timestamp `getLastEventTime()` uses for failed/rejected/cancelled
- 500MB File Limit (ADR-0005) — the in-memory `ArrayBuffer` for auto-download is bounded by this
- 1:1 Connections (ADR-0017) — both peers see the same Files panel, which is why the layout has to be role-agnostic
