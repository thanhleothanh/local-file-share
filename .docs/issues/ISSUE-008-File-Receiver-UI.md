# ISSUE-008: File Receiver UI

## Parent
PRD-003: User Interface

## What to build
Implement the user interface for receiving files, including offer notifications, accept/reject controls, and download functionality.

## Acceptance criteria
- [ ] Incoming file offer notifications appear as modals/overlays
- [ ] Notification shows file details: name, size, type
- [ ] Accept button available for each file offer
- [ ] Reject button available for each file offer
- [ ] Multiple file offers can be displayed simultaneously
- [ ] Received files listed with progress
- [ ] Direction indicator shows "Receiving:" prefix for received files
- [ ] Progress bar shown for TRANSFERRING files
- [ ] Percentage complete shown for each transfer
- [ ] Download button appears next to progress bar at 100% completion
- [ ] Download button downloads the complete file to device
- [ ] Downloaded files show checkmark or "Downloaded" text
- [ ] Downloaded files are automatically cleaned up from storage
- [ ] Visual indicator of download completion (checkmark icon)
- [ ] Queue indicator shows number and total size of queued files
- [ ] Queue status updates in real-time

## Blocked by
- ISSUE-001 (QR Code Connection Handshake)
- ISSUE-006 (Connection UI)
- ISSUE-007 (File Sender UI - shares transfer list component)

## User stories covered
17. As a user, I want to see incoming file offer notifications so that I know someone is sending me a file
18. As a user, I want to see file details (name, size, type) in the notification so that I can decide whether to accept
19. As a user, I want to see accept and reject buttons for each file offer so that I can control what I receive
20. As a user, I want to see received files listed with progress so that I can track downloads
21. As a user, I want to see a download button for each completed file so that I can save it to my device
22. As a user, I want to see a visual indicator of download completion so that I confirm the file is ready

## Notes
- File offer modal should be prominent and clear
- File details should be sufficient for user to make accept/reject decision
- Download button should trigger browser download (Blob URL)
- Downloaded files should show checkmark icon when downloaded
- Queue badge should show both count and total size
- All UI updates driven by file state machine (ADR-0011)
