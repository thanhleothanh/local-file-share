# ISSUE-010: Application Orchestration

## Parent
PRD-005: Integration and Testing

## What to build
Implement the application orchestrator that initializes all modules, sets up event communication between them, and coordinates the complete application flow.

## Acceptance criteria
- [x] Application orchestrator initializes all modules in correct order (init() in main.js)
- [x] Event bus (pub/sub system) implemented for inter-module communication (each module has on/emit)
- [x] All modules can publish and subscribe to events (webrtcManager, fileTransferManager, etc.)
- [x] Connection events: stateChange, connected, closed, idleTimeout emitted
- [x] File events: fileOfferSent, fileOfferReceived, fileAccepted, fileRejected, fileCancelled emitted
- [x] Transfer events: fileTransferStarted, fileTransferComplete, fileProgress emitted
- [x] UI events: handled via direct function calls and onclick handlers
- [x] Storage events: storage initialized, files saved/deleted via storageManager
- [x] Central error handler catches and reports all errors (errorHandler.js)
- [x] User-facing errors are clear and actionable (showAlert in main.js)
- [x] Technical errors are logged to console (errorHandler logs all errors)
- [x] Fail-fast behavior implemented (close connection on critical errors)
- [x] Loading indicator shown during application initialization (showLoading/hideLoading)
- [x] Application works as single HTML file (or bundled) (Vite builds to dist/)
- [x] All dependencies loaded (zxing-js, pako, uuid via npm)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake)
- ISSUE-002 (File Offer and Accept Protocol)
- ISSUE-003 (File Chunking and Transfer)
- ISSUE-004 (Queue Management and Limits)
- ISSUE-005 (IndexedDB Storage and Persistence)
- ISSUE-006 (Connection UI)
- ISSUE-007 (File Sender UI)
- ISSUE-008 (File Receiver UI)
- ISSUE-009 (Progress and Queue UI)

## User stories covered
1. As a user, I want all features to work together seamlessly so that I can share files without issues
2. As a user, I want the application to work on both desktop and mobile browsers so that I can use it on any device
5. As a user, I want to see a loading indicator during application initialization so that I know it's working
6. As a user, I want the application to be a single HTML file so that deployment is trivial

## Notes
- Event bus should be lightweight and efficient
- Error handler should provide context with errors
- Loading indicator should be visible until all modules are ready
- Application should work with CDN dependencies for development
- Production can bundle dependencies into single file
- All modules should be loosely coupled through events
