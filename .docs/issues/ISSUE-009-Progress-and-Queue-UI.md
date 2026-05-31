# ISSUE-009: Progress and Queue UI

## Parent
PRD-003: User Interface

## What to build
Implement the progress tracking and queue display UI components.

## Acceptance criteria
- [x] Transfer list shows all active, queued, and completed transfers
- [x] Each transfer has its own progress bar
- [x] Progress bars show green gradient fill with percentage text
- [x] Percentage complete is accurate and updates in real-time
- [x] Direction indicator (→ for sending, ← for receiving) shown for each file
- [x] Queued files listed separately from active transfers
- [x] Queue badge shows number of files waiting (e.g., "3 files waiting")
- [x] Queue badge shows total queue size in MB
- [x] Queue indicator updates in real-time as files are added/removed
- [x] Completed files show checkmark when downloaded
- [x] Completed files show "Downloaded" text
- [x] Failed files show error state with red indicator
- [x] Rejected files show rejected state
- [x] Transfer list is scrollable for many files
- [x] Progress bars are horizontally oriented
- [x] Percentage text is centered in progress bar
- [x] Download button appears immediately at 100% completion

## Blocked by
- ISSUE-007 (File Sender UI)
- ISSUE-008 (File Receiver UI)

## User stories covered
23. As a user, I want to see a progress bar for each file transfer so that I can monitor progress
24. As a user, I want to see the percentage complete for each transfer so that I have precise information
25. As a user, I want to see the direction indicator (sending/receiving) for each file so that I know the flow
26. As a user, I want to see queued files listed separately so that I know what's waiting
27. As a user, I want to see the queue size (e.g., "3 files waiting") so that I know how many are pending
28. As a user, I want to see the total queue size in MB so that I can monitor storage usage

## Notes
- Transfer list should be a single unified list for both sending and receiving
- Progress calculation: (bytesReceived / totalBytes) * 100
- Direction indicator should be clear and unobtrusive
- Queue badge should be visible near the transfer list
- Progress bars should be consistent in style
- Transfer list should update efficiently (no full re-renders)
