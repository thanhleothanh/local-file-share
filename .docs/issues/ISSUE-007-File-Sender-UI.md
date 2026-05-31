# ISSUE-007: File Sender UI

## Parent
PRD-003: User Interface

## What to build
Implement the user interface for selecting and sending files.

## Acceptance criteria
- [x] File selection button/input is visible when connected
- [x] User can select multiple files at once
- [x] Selected files are validated (size <= 500MB each)
- [x] File validation errors displayed clearly (size > 500MB)
- [ ] Preview of selected files shown before sending (partial - files are sent immediately on selection)
- [x] Preview shows file name, size, and type for each file (in queue display)
- [x] Send button available to initiate transfer (via file selection)
- [x] Sent files listed with their status
- [x] File status indicators: PENDING, QUEUED, TRANSFERRING, COMPLETED, FAILED, REJECTED
- [ ] Cancel button available for pending file offers (not implemented yet)
- [x] Direction indicator shows implicitly (send vs receive)
- [ ] Progress bar shown for TRANSFERRING files (UI elements exist but not fully connected)
- [ ] Percentage complete shown for each transfer (not implemented yet)
- [ ] Completed files show download button (for receiver to download) (auto-download on completion)
- [x] Failed/rejected files show appropriate error state
- [x] UI updates in real-time as state changes
- [x] Multiple files can be selected and sent sequentially

## Blocked by
- ISSUE-001 (QR Code Connection Handshake)
- ISSUE-006 (Connection UI)

## User stories covered
10. As a user, I want to see a file selection button/input so that I can choose files to send
11. As a user, I want to select multiple files at once so that I can send a batch
12. As a user, I want to see file validation errors (size > 500MB) so that I know why a file can't be sent
13. As a user, I want to see a preview of selected files before sending so that I can verify
14. As a user, I want to see a send button so that I can initiate file transfer
15. As a user, I want to see sent files listed with their status so that I can track progress
16. As a user, I want to see a cancel button for pending file offers so that I can cancel before transfer starts
23. As a user, I want to see a progress bar for each file transfer so that I can monitor progress
24. As a user, I want to see the percentage complete for each transfer so that I have precise information
25. As a user, I want to see the direction indicator (sending/receiving) for each file so that I know the flow

## Notes
- File state machine drives file status display (ADR-0011)
- Progress bars use green gradient fill with percentage text
- Direction indicators: ↑ for sending, ↓ for receiving
- Download button appears next to progress bar at 100% for receiver
- Cancel button only available for PENDING files
