# 31. Image Upload as Alternative QR Input Source

**Status**: Accepted
**Date**: 2026-06-06

## Context

The QR handshake relies solely on the device camera to scan offer and answer QRs. The QR scanner pane at each scan point shows a live video preview and decodes frames continuously.

This is awkward on desktops: a desktop user has no convenient way to aim a built-in webcam at a phone screen, and on some desktops the webcam is absent, disabled, or blocked by OS-level permission. Even when a webcam works, pointing it at a small phone screen across a room is fiddly compared to a screenshot or a photo.

The same pain applies symmetrically to both scan points — the user is equally stuck on the offer scan and on the answer scan.

## Decision

Add **image upload as a parallel input source** for QR scanning. Available at every scan point. The user can scan a QR either by:

- pointing the camera at it (existing path, unchanged), **or**
- clicking an **"Or upload QR image"** button in the scanner pane, picking an image file, and having the browser decode the QR from the file.

The upload path is wired through the **same validation pipeline** as the camera path — there is exactly one source of truth for "is this a valid local-file-share QR". The new path automatically inherits the existing JSON parsing, structure validation, error handling, and stop-scanning-on-success behaviour, with no risk of the camera and upload paths diverging in what counts as a "valid" QR.

### UI: per-pane file input + button

Each scanner pane gets one new pair: a hidden file input and a visible button labelled **"Or upload QR image"**. The button is the visible affordance; the file input is opened via a click on the button.

The button is **centered on top of the live video preview** with a lightly transparent background so the camera feed shows through. The button sits above the existing overlay and guide elements. The camera sensor is unaffected by the overlay — the QR is captured from the real-world scene, not from the composited display — so centering the button does not block scanning.

### Constraints

| Constraint | Value | Reason |
|---|---|---|
| Accepted file types | Images only (browser-native filter) | Covers PNG, JPEG, WebP, GIF, BMP, TIFF, etc. Restricting to a hard list breaks the "screenshot from a phone" workflow. |
| Maximum file size | 10 MB | Most QR screenshots are <2 MB; full-screen 4K screenshots can hit 8–15 MB. The decode library still handles larger files, but loading a 15 MB bitmap is a noticeable hitch. |
| Camera behaviour when picker opens | Camera continues running | The user can change their mind; closing the picker returns to the live scanner without a re-initialization round-trip. |
| Failure path (no QR / invalid QR / oversize / non-image) | Toast + stay in pane | The camera is still active, so the user can fall back. **No rollback to the idle state.** |
| File input value reset | After every pick, and whenever the user navigates away from the pane | The same file can be re-picked after a fix, and stale state doesn't persist when the user navigates away. |

### Camera decline behaviour (new)

When the user denies camera access, the previous behaviour rolled the connection back to the idle state and re-rendered — the scanner pane disappeared, taking the upload button with it.

New behaviour: on camera failure, **leave the scanner pane visible**, show a single toast indicating the camera is unavailable, and keep the upload button active. The user can still connect by uploading a screenshot or photo. The rollback is removed from both error-handling paths at the two scan points. The toast is shown exactly once.

## Consequences

**Positive**

- Desktop users have a more convenient way to scan QRs (screenshot, photo).
- Users whose camera permission is denied can still connect.
- Zero behaviour change for mobile users who never touch the upload button.
- Single validation pipeline — no risk of the camera and upload paths diverging in what counts as a "valid" QR.
- Reuses the existing QR decode library (no new dependency).

**Negative**

- Added code surface area: a new entry point on the QR handler, two new file inputs, two new buttons, two new event listeners, two new click handlers, a new CSS class.
- More error paths to consider (no QR in image, invalid QR in image, oversize file, non-image file, camera decline).
- The change-event handler lives in the main orchestration file, which is already large. No new module extracted.

## Alternatives Considered

1. **Auto-fallback only on camera error** — show the upload button only when the camera fails. Rejected: doesn't help users with a working but inconvenient webcam, which is the stated motivation.
2. **Toggle between camera and upload in the scanner pane** (two-state switch). Rejected: adds a UI state and a "what's the current scan input mode" flag for a feature that's just a parallel input source. The user can see both options side-by-side without a state machine.
3. **Drag-and-drop and clipboard-paste in v1.** Rejected: expands the input surface from "file picker" to "file picker + paste handler + drop zone" — three code paths, all needing the same "is this a valid image file?" gate. Click-to-pick only for v1; drag/drop and paste are a follow-up.
4. **Single shared file input for both scan points** (one input outside the panes). Rejected: conflicts with the per-pane pattern of the existing scanner code (one video element per pane). Per-pane is self-contained and easier to reason about.
5. **Hard format restriction** (PNG/JPEG/WebP only). Rejected: breaks the screenshot-from-a-phone workflow (Android screenshots can be WebP, iOS screenshots are PNG/JPEG, but third-party screenshot tools produce other formats). The soft filter covers the common cases while still letting the OS picker show all files where it doesn't filter.
6. **Replace the camera path with upload-only on desktop** (UA- or viewport-detection). Rejected: requires defining "desktop", adds a branch in the orchestration code, and silently changes behaviour for users who rely on the camera.

## Related Decisions

- Two-QR handshake for connection establishment (ADR-0003) — the upload path serves the same two scan points.
- QR compression with gzip + base64 (ADR-0012) — the upload path uses the same structure validation.
- zxing-js/browser for QR code scanning (ADR-0016) — superseded by ADR-0022, which is the canonical library decision this ADR builds on.
- zxing-js/browser for QR (ADR-0022) — the library that powers the upload path's image-file decode.
- Toast notifications (ADR-0029) — the failure path uses the same toast channel as the camera error path.
