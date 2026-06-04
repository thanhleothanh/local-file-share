# Issue 00016 — Design Review: Full File-Sharing Flow

## Parent

Derived from `.docs/prds/0009-ui-files-tab-and-send-receive-flow.md` (UX review) and `.docs/prds/0010-toast-notifications.md` (visual review).

## What to build

Pause for a human-in-the-loop design review before continuing. Open the app, run a representative scenario end-to-end, and review every aspect of the user experience.

## Acceptance criteria

- [ ] **End-to-end walkthrough performed by reviewer**: open the app on two devices (or two browser contexts), establish a connection, send a batch of files, accept/reject on the receiver, watch progress, complete a transfer, disconnect
- [ ] **Connection tab review**: device list readability, "You" badge, busy state, server-disconnected indicator, Connect button states, device name editing UX
- [ ] **Files tab review**: list density, direction indicators (↑/↓), progress bar style, action button placement, empty-state copy ("Tap + to send your first file" vs "Connect a device to start sharing files"), sender vs receiver visual differentiation
- [ ] **Toast review**: positioning (top-right desktop, full-width mobile), colour scheme, icon choices, stacking order (newest at bottom), mobile safe-area handling, accessibility (announce timing, contrast)
- [ ] **State transition review**: PENDING → TRANSFERRING → COMPLETED transitions feel smooth; no jarring layout shifts; cancel confirmation copy is clear
- [ ] **Mobile responsive review**: at 360 × 640 viewport, every screen is usable; no horizontal scroll; tap targets are at least 44 × 44 px
- [ ] **Reviewer notes** collected in `.docs/reviews/0001-design-review.md` with specific change requests, if any
- [ ] If reviewer requests changes, file follow-up issues for each change
- [ ] If reviewer approves, this issue is closed and slice 17 can start

## Blocked by

- 00015 (full Files tab UI is in place)

## User stories covered

- UX acceptance for PRD-0008, PRD-0009, PRD-0010
