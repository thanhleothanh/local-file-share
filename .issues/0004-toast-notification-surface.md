# Issue 0004 — Toast Notification Surface

## Parent

Derived from `.docs/prds/0010-toast-notifications.md`.

## What to build

A single notification surface replaces the previous inline tab alerts. `ToastManager` owns a container element appended lazily to `document.body`. `ToastNotification` Lit component renders one toast with one of four variants. A `toast(type, message)` function is the single call site for all user-facing messages. Toasts are positioned top-right on desktop and full-width at the top on mobile (≤ 768 px), with `safe-area-inset-top` to clear the iPhone notch. Every toast auto-dismisses after 2 seconds.

## Status

Done — 2026-06-04. `toast(type, message)` is the only public API. `ToastManager` is a singleton with lazy container creation on first call. Container is `position: fixed`, top-right on desktop, full-width on mobile (≤ 768 px) with `env(safe-area-inset-top)`. Four variants with icons, dark-tinted backgrounds, proper roles and ARIA attributes. Auto-dismiss after 2000 ms. 18 unit tests pass (8 for ToastNotification, 10 for ToastManager). 146 total tests. E2E test added but cannot run on this host (Playwright does not support chromium on ubuntu26.04-x64 — browser install fails; pre-existing skeleton E2E also fails for the same reason).

## Acceptance criteria

- [x] `toast(type, message)` function is the only public API; it delegates to `ToastManager.show`
- [x] `ToastManager.show` lazily creates the container element on the first call (no DOM at startup)
- [x] Container is `position: fixed`, top-right on desktop (≥ 769 px), full-width on mobile (≤ 768 px)
- [x] Mobile container uses `padding-top: env(safe-area-inset-top)` to clear the iPhone notch
- [x] Container is a vertical flex column; new toasts are appended to the end (bottom of stack)
- [x] Four variants: `error` (red), `success` (green), `info` (cyan), `warning` (orange) — each with matching dark-tinted solid background and icon
- [x] Each toast has `role="alert"` (error) or `role="status"` (other); container has `aria-live="polite"` and `aria-atomic="false"`
- [x] Icon is `aria-hidden`; the message text is in a `<p>` with sufficient contrast (4.5:1 minimum)
- [x] Each toast auto-dismisses after 2000 ms with no manual dismiss button
- [x] Entry animation: `translateY(-8px) opacity 0` → `translateY(0) opacity 1` over 200 ms `ease`
- [x] Exit animation: reverse over 200 ms `ease`
- [x] Calling `toast('error', 'Hello')` three times in quick succession shows three stacked toasts, each with its own timer
- [x] Unit test (Vitest + happy-dom): `toast('error', 'foo')` creates a container, appends a toast with `role="alert"`, removes it after 2000 ms (fake timers); `toast('success', ...)` uses `role="status"`
- [x] Unit test: `ToastNotification` renders the right icon (`✕`, `✓`, `ℹ`, `⚠`) for each type
- [ ] E2E test (Playwright): added but blocked — `npx playwright install chromium` fails on ubuntu26.04-x64 (pre-existing limitation, also blocks the skeleton E2E)

## Blocked by

- 0003 (AppShell must exist to host the toast container)

## User stories covered

- PRD-0010 stories 1-10
