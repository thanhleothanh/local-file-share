# 24. Toast Notifications

**Status**: Accepted
**Date**: 2026-06-02

## Context

Success, error, info, and warning messages are surfaced to the user in
two places: errors raised anywhere in the application funnel through
the central error handler, and the file transfer and connection code
emit ad-hoc confirmation and failure messages inline. Until now both
streams were rendered as inline alert banners inside the Connection
tab and the Files tab. That worked for correctness but caused two
problems:

- The alerts live inside the tab content, so showing one shifts the
  content below it and dismissing it shifts it back. During a fast
  transfer the layout is never stable.
- Each tab owns its own alert div, so the same message would be
  rendered differently depending on which tab is active, and a
  message triggered by a tab-switching action can be missed entirely.

The fix is a single, tab-independent notification surface that floats
over the app and is not part of any tab's layout flow.

## Decision

All user-facing messages — success, error, info, warning — are
rendered as **toast notifications** by a single shared manager.

**Position and layout.** The toast container is `position: fixed` at
the **top-right** of the screen with a small margin. The container is
appended to `document.body` lazily, on the first toast, so it does
not exist in the DOM when no toasts are active. The container is a
vertical flex column. New toasts are appended to the end, which puts
the newest one at the bottom of the stack — closest to the corner
the user is already looking at.

**Mobile.** On viewports ≤ 768 px the container switches to a
full-width strip pinned to the top edge, with side margins shrunk
to 0.5 rem and `padding-top: env(safe-area-inset-top)` to clear the
iPhone notch. The corner-pinned design that works on a desktop
would be too narrow to read on a phone; the full-width strip is the
thumb-reachable equivalent.

**Styling.** Each toast is a card with a left-border accent, a
**solid** dark-tinted background, an icon, and the message text.
Four type variants map to the existing design tokens for border and
text colour; the background is a dark shade of the same colour so
the toast is opaque against any tab content behind it:

- `error` → border/text `--error` (red), background `#5c1f1f`, icon `✕`
- `success` → border/text `--success` (green), background `#1f4628`, icon `✓`
- `info` → border/text `--accent` (cyan), background `#0e3a4a`, icon `ℹ`
- `warning` → border/text `--warning` (orange), background `#4a3015`, icon `⚠`

The icon, the border, and the text are all the same bright type
colour; the background is a darker shade of the same colour so the
type is unmistakable at a glance, and the toast is fully opaque
(solid) — it does not let the tab content behind it bleed through
and create visual noise.

**Animation.** The toast drops down from above into place on entry
(`translateY(-8px) → 0` with `opacity: 0 → 1`) and slides back up
while fading on exit, both over 200 ms with `ease`. The
top-pinned entry feels like a notification banner arriving; the
symmetric exit is the toast leaving in the direction it came from.
Subtle is the goal — the toast is information, not a punch line.

**Lifetime.** Every toast auto-dismisses after 2 seconds, with no
explicit dismiss button. Two seconds is short enough that a burst
of three errors does not pile up unread, and long enough to read a
short sentence. Critical errors that need acknowledgement are not
raised as toasts in the first place — they go through the central
error handler's higher-severity path, which uses different UI.

**Stacking.** Multiple toasts stack vertically. Each toast is
independent and dismisses on its own timer; the user can scan the
stack from newest (bottom) to oldest (top) and read each one as it
fades.

**Accessibility.** The container carries `aria-live="polite"` and
`aria-atomic="false"` so screen readers announce new toasts without
re-reading the whole list. Each toast has `role="alert"` for errors
(immediate announcement) and `role="status"` for the other types
(announced during the next pause). The icon is `aria-hidden`; the
message text carries the meaning.

**Single call site.** Both the central error handler's message
stream and the ad-hoc confirmation messages go through one
function. There is no `connectionAlert` / `filesAlert` split any
more — the inline alert divs in both tabs are removed.

## Consequences

**Positive:**

- The Connection and Files tabs no longer shift when a message is
  shown or hidden, because the notification surface is outside
  their layout flow.
- One notification path for the whole app — success, error, info,
  warning — keeps the visual language consistent regardless of
  which tab raised the message.
- Lazy container creation keeps the DOM clean when nothing is
  happening; the container only appears when the first toast fires.
- Mobile uses a full-width strip with `safe-area-inset-top`, which
  works on notched phones without sliding under the notch.

**Negative:**

- A 2-second window is short for a long error message. Messages
  that need more time are routed through the central error handler
  instead, which uses a different surface.
- Stacking can briefly crowd the bottom-right on a phone when
  many errors fire in quick succession. The 2-second timer keeps
  the stack short in practice; a hard cap on simultaneous toasts
  could be added later if it becomes a problem.
- Auto-dismiss with no `×` button means the user cannot pause a
  toast. If a user needs to re-read, the message is gone.

## Alternatives Considered

1. **Keep the inline tab alerts.** Solves nothing — the layout-shift
   problem is the reason for the change. Rejected.
2. **A single modal dialog for errors, inline for success.** Asymmetric
   and does not address layout shift. Rejected.
3. **Toast queue, one at a time.** Hides errors that arrive while
   another is showing. Stack-and-fade is the more honest model.
   Rejected.
4. **Per-type duration (3 s success, 6 s error, persistent for critical).**
   The simpler uniform-2-second policy is enough for the current
   message set, and the error-handler escalation path covers the
   cases that need more time. Rejected.
5. **Bottom of screen on desktop.** Would compete with the tab
   content and the send button row on a tall viewport; the top
   corner is the conventional notification surface and the
   least-busy location in this layout. Rejected.
6. **Strict top-right on mobile too.** A 360 px corner toast on a
   320 px phone is too narrow to read and easy to miss. The
   full-width strip is the same affordance, adapted. Rejected.
7. **No icon, colour only.** Slow to scan — the user has to read the
   text before knowing the type. Icon + colour is the same cost
   with a faster read. Rejected.

## Related Decisions

- Fail-Fast Error Handling (ADR-0003) — defines severity levels; the
  toast is the surface for HIGH and MEDIUM; CRITICAL closes the
  connection and surfaces differently
- Unified Files Tab (ADR-0018) — the Files tab is now quiet
  (header + list, no inline alerts) so toasts do not compete with
  in-tab messaging
- Connection Tab (ADR-0019) — the Connection tab is now quiet
  so toasts do not compete
- Lit Frontend Framework (ADR-0022) — toast is implemented as a
  Lit component with Shadow DOM encapsulation
