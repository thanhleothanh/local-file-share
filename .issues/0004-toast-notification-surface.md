# Issue 0004 — Toast Notification Surface

## Parent

Derived from `.docs/prds/0010-toast-notifications.md`.

## What to build

A single notification surface replaces the previous inline tab alerts. `ToastManager` owns a container element appended lazily to `document.body`. `ToastNotification` Lit component renders one toast with one of four variants. A `toast(type, message)` function is the single call site for all user-facing messages. Toasts are positioned top-right on desktop and full-width at the top on mobile (≤ 768 px), with `safe-area-inset-top` to clear the iPhone notch. Every toast auto-dismisses after 2 seconds.

## Acceptance criteria

- [ ] `toast(type, message)` function is the only public API; it delegates to `ToastManager.show`
- [ ] `ToastManager.show` lazily creates the container element on the first call (no DOM at startup)
- [ ] Container is `position: fixed`, top-right on desktop (≥ 769 px), full-width on mobile (≤ 768 px)
- [ ] Mobile container uses `padding-top: env(safe-area-inset-top)` to clear the iPhone notch
- [ ] Container is a vertical flex column; new toasts are appended to the end (bottom of stack)
- [ ] Four variants: `error` (red), `success` (green), `info` (cyan), `warning` (orange) — each with matching dark-tinted solid background and icon
- [ ] Each toast has `role="alert"` (error) or `role="status"` (other); container has `aria-live="polite"` and `aria-atomic="false"`
- [ ] Icon is `aria-hidden`; the message text is in a `<p>` with sufficient contrast (4.5:1 minimum)
- [ ] Each toast auto-dismisses after 2000 ms with no manual dismiss button
- [ ] Entry animation: `translateY(-8px) opacity 0` → `translateY(0) opacity 1` over 200 ms `ease`
- [ ] Exit animation: reverse over 200 ms `ease`
- [ ] Calling `toast('error', 'Hello')` three times in quick succession shows three stacked toasts, each with its own timer
- [ ] Unit test (Vitest + happy-dom): `toast('error', 'foo')` creates a container, appends a toast with `role="alert"`, removes it after 2000 ms (fake timers); `toast('success', ...)` uses `role="status"`
- [ ] Unit test: `ToastNotification` renders the right icon (`✕`, `✓`, `ℹ`, `⚠`) for each type
- [ ] E2E test (Playwright): call `toast('success', 'Connected to Server')` from the console; assert a toast appears top-right; after 2 seconds it disappears; resize viewport to 360 × 640; call again; assert the toast appears as a full-width strip at the top

## Blocked by

- 0003 (AppShell must exist to host the toast container)

## User stories covered

- PRD-0010 stories 1-10
