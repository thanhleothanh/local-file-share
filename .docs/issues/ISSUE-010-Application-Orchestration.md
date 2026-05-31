# ISSUE-010: Application Orchestration

## Parent
PRD-005: Integration and Testing

## What to build
Implement the application orchestrator that initializes all modules, sets up event communication between them, and coordinates the complete application flow.

## Acceptance criteria
- [ ] Application orchestrator initializes all modules in correct order
- [ ] Event bus (pub/sub system) implemented for inter-module communication
- [ ] All modules can publish and subscribe to events
- [ ] Connection events: CONNECTION_NEW, CONNECTION_CONNECTED, CONNECTION_TRANSFERRING, CONNECTION_FAILED, CONNECTION_CLOSED
- [ ] File events: FILE_OFFERED, FILE_ACCEPTED, FILE_REJECTED, FILE_QUEUED, FILE_TRANSFERRING, FILE_COMPLETED, FILE_FAILED, FILE_CANCELLED
- [ ] Transfer events: TRANSFER_STARTED, TRANSFER_PROGRESS, TRANSFER_COMPLETED
- [ ] UI events: UI_QrScanned, UI_FileSelected, UI_AcceptClicked, UI_RejectClicked, UI_DownloadClicked, UI_CloseClicked
- [ ] Storage events: STORAGE_FILE_SAVED, STORAGE_FILE_DOWNLOADED, STORAGE_CLEANUP
- [ ] Central error handler catches and reports all errors
- [ ] User-facing errors are clear and actionable
- [ ] Technical errors are logged to console
- [ ] Fail-fast behavior implemented (close connection on critical errors)
- [ ] Loading indicator shown during application initialization
- [ ] Application works as single HTML file (or bundled)
- [ ] All dependencies loaded (zxing-js, pako, uuid)

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
