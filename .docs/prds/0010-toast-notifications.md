# PRD 0010 — Toast Notifications

## Problem Statement

Success, error, info, and warning messages were previously rendered as inline alert banners inside the Connection tab and the Files tab. This caused two problems: the alerts were part of the tab's layout, so showing one shifted the content below it; and each tab owned its own alert div, so the same message was rendered differently depending on which tab was active. The fix is a single, tab-independent notification surface that floats over the app and is not part of any tab's layout flow.

## Solution

A `ToastManager` that owns a single container element appended lazily to `document.body`. A `ToastNotification` Lit component renders one toast. All user-facing messages — from the central error handler, the file transfer code, the connection code, and ad-hoc confirmations — funnel through one `toast(type, message)` function. Toasts are positioned top-right on desktop and full-width at the top on mobile (≤ 768 px), with `safe-area-inset-top` to clear the iPhone notch. Every toast auto-dismisses after 2 seconds; there is no manual dismiss button.

## User Stories

1. As a user, I want success, error, info, and warning messages to appear in a consistent place, so that I always know where to look.
2. As a user, I want toast messages to not shift the tab content, so that the layout is stable.
3. As a user on desktop, I want toasts to appear in the top-right corner, so that they do not cover the main content.
4. As a user on mobile, I want toasts to appear as a full-width strip at the top, so that I can read them on a narrow screen.
5. As a user, I want toasts to auto-dismiss after 2 seconds, so that the screen does not stay cluttered.
6. As a user, I want to see a coloured icon next to each toast indicating its type (error / success / info / warning), so that I can scan quickly.
7. As a user, I want multiple toasts to stack vertically, so that I can see a history of recent events.
8. As a developer, I want a single `toast(type, message)` function for all user-facing messages, so that there is no duplicated logic.
9. As a user with a screen reader, I want toasts to be announced automatically, so that I am not left out.
10. As a user, I want toasts to have a solid background, so that the tab content behind them does not bleed through.

## Implementation Decisions

### Module: `ToastManager`
- Singleton: a single instance created at app startup
- `init()` — creates the container element (lazy; only on first toast)
- `show(type: ToastType, message: string)` — creates a `ToastNotification` element, appends it to the container, sets a 2-second auto-dismiss timer
- `dismiss(toastElement)` — removes the toast, animates exit
- Internally: a `Set<ToastNotification>` to track active toasts (for tests and for the stack)
- Single responsibility: own the toast container and lifecycle. Does not know about errors or specific message types — it just renders a typed message.

### Module: `ToastNotification` (Lit component)
- Renders one toast: left-border accent, icon, message text
- Four variants: `error` (red), `success` (green), `info` (cyan), `warning` (orange) — each with a matching dark-tinted background
- Animation: drops down from above on entry (`translateY(-8px) → 0`, opacity `0 → 1`), slides up and fades on exit
- Accessibility: `role="alert"` for errors, `role="status"` for others; container has `aria-live="polite"`, `aria-atomic="false"`
- Single responsibility: render one toast. Does not know about the manager or other toasts.

### Module: `toast()` (single function API)
- `toast(type, message)` — calls `ToastManager.show(type, message)`
- Imported by every module that wants to surface a message
- Replaces the old `connectionAlert` / `filesAlert` split

### Toast container positioning
- Desktop: `position: fixed; top: 1rem; right: 1rem;` — vertical flex column, new toasts appended to the bottom
- Mobile (≤ 768 px): `position: fixed; top: 0; left: 0; right: 0; padding-top: env(safe-area-inset-top); padding-left: 0.5rem; padding-right: 0.5rem;`
- Container is `display: flex; flex-direction: column;` with a small gap between toasts
- Container is appended to `document.body`, not to any tab, so it is not part of any layout flow

### Toast styling
- Card with `border-left: 4px solid var(--{type})`
- Background: dark tint of the type colour (e.g., `#5c1f1f` for error) — solid, not transparent
- Icon: `✕` for error, `✓` for success, `ℹ` for info, `⚠` for warning
- Text colour: the bright type colour (`var(--error)`, `var(--success)`, etc.)
- Padding: `0.75rem 1rem`
- Max width: `360px` (desktop) or `100%` minus 1rem (mobile)
- Border radius: `4px`
- Box shadow: subtle, `0 2px 8px rgba(0, 0, 0, 0.2)`

### Animation
- Entry: 200 ms `ease`, `opacity: 0; transform: translateY(-8px);` → `opacity: 1; transform: translateY(0);`
- Exit: 200 ms `ease`, reverse
- Implemented with CSS transitions (no animation library)

### Auto-dismiss
- Every toast gets a `setTimeout(dismiss, 2000)` on creation
- The timer is cleared if the toast is dismissed early (not currently exposed, but the architecture supports it)
- No manual dismiss button — the 2-second window is enough for short messages, and critical errors go through the central error handler's higher-severity path

### Stacking
- Multiple toasts stack vertically
- Each toast has its own timer; they dismiss independently
- The user scans the stack from newest (bottom) to oldest (top)

### Accessibility
- Container: `aria-live="polite"`, `aria-atomic="false"` (only new toasts are announced)
- Errors: `role="alert"` (immediate announcement)
- Success / info / warning: `role="status"` (announced during the next pause)
- Icon: `aria-hidden="true"` (decorative; the text carries the meaning)
- Message text: in a `<p>` with the right contrast (4.5:1 minimum)

### Call sites
- `ErrorHandler` (PRD 0011) — every caught error → `toast('error', message)`
- `ConnectionViewModel` (PRD 0008) — connection accepted, connection rejected, peer disconnected → `toast('success' | 'warning', message)`
- `FileActionsViewModel` (PRD 0009) — file sent, file received, file failed → `toast('success' | 'error', message)`
- `WebSocketAutoReconnect` (PRD 0004) — server reconnected → `toast('info', 'Server reconnected')`

### SOLID application
- **S** — `ToastManager` owns the container, `ToastNotification` owns one toast, the `toast()` function owns the public API
- **O** — adding a new toast type (e.g., `loading`) is a new variant on the existing components; the call sites do not change
- **L** — `ToastManager` is substitutable behind a `NotificationService` interface; a future modal-based notification system would implement the same interface
- **I** — `ToastNotification` is a small focused component; it does not need to know about the manager
- **D** — call sites depend on the `toast()` function, not on the `ToastManager` or DOM

## Testing Decisions

### What makes a good test
- Test the manager with `happy-dom` — mount a fake `document.body`, trigger toasts, assert the container and toasts are created
- Test the toast component with each of the 4 types — assert the icon, background, and role
- Test the `toast()` function in isolation — it just delegates to the manager

### Modules to test
- `ToastManager` (unit, Vitest with `happy-dom`) — `show('error', 'foo')` creates a container if missing, appends a toast with the right type. Calling `show` twice creates two toasts that stack. After 2 seconds (fake timers), the toasts are removed.
- `ToastNotification` (unit, Vitest with `happy-dom`) — given `type='error'`, the rendered DOM has the right border colour, background, and icon. `role="alert"` is set. Given `type='success'`, `role="status"` is set.
- `toast()` function (unit, Vitest) — calls the manager's `show` with the right arguments.

### Test framework
- Vitest with `vi.useFakeTimers()` for the auto-dismiss
- `happy-dom` for DOM

### Prior art
None. Pattern: each test triggers the API, then queries the DOM for the expected elements. No real timers, no real animations.

## Out of Scope

- The actual error/success message generation (PRD 0011 covers the central error handler; the rest of the call sites are scattered across PRDs 0008 and 0009)
- Persistent notifications (toasts always auto-dismiss)
- User-configurable timing
- Sound effects or visual flourishes (subtle is the goal)

## Further Notes

- The toast container should be created lazily — no DOM overhead at app startup. The first `toast()` call creates it.
- The container is a single DOM element shared by all toasts. Toasts are children that are added and removed.
- The mobile breakpoint is 768 px (matches common tablet/mobile split). Below that, the container goes full-width.
- `safe-area-inset-top` is set to clear the iPhone notch. The container's `padding-top` uses the env() function so it adapts to the device.
- The toast should not block clicks on the content behind it. Pointer events on the toast are passed through, except on interactive elements (there are none in the current design, but the architecture supports it).
- The 2-second auto-dismiss is a hard-coded constant in `ToastManager`. If user feedback shows it's too short, it can be made configurable — but for now, the uniform 2-second policy is the simpler choice.
