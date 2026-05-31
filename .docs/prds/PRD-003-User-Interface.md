# PRD-003: User Interface

## Problem Statement

Users need an intuitive interface to establish connections via QR codes, select files to send, manage incoming file offers, and monitor transfer progress.

## Solution

Build a responsive web interface that works across desktop and mobile browsers, providing clear visual feedback for connection state, file transfers, and QR code scanning.

## User Stories

### Connection UI
1. As a new user, I want to see clear instructions on how to start sharing files so that I know what to do
2. As a user, I want to see a "Create Connection" button so that I can initiate a connection
3. As a user, I want to see my generated QR code prominently displayed so that another device can scan it
4. As a user, I want to see a "Scan QR Code" button so that I can scan another device's QR code
5. As a user, I want camera access to work seamlessly on mobile so that I can scan QR codes
6. As a user, I want to see connection status messages so that I know if connection is pending, connected, or failed
7. As a user, I want to see the second QR code displayed after scanning the first so that I can complete the handshake
8. As a user, I want to see an error message if QR code scanning fails so that I can retry
9. As a user, I want to see a disconnect/close button so that I can end the connection

### File Sending UI
10. As a user, I want to see a file selection button/input so that I can choose files to send
11. As a user, I want to select multiple files at once so that I can send a batch
12. As a user, I want to see file validation errors (size > 500MB) so that I know why a file can't be sent
13. As a user, I want to see a preview of selected files before sending so that I can verify
14. As a user, I want to see a send button so that I can initiate file transfer
15. As a user, I want to see sent files listed with their status so that I can track progress
16. As a user, I want to see a cancel button for pending file offers so that I can cancel before transfer starts

### File Receiving UI
17. As a user, I want to see incoming file offer notifications so that I know someone is sending me a file
18. As a user, I want to see file details (name, size, type) in the notification so that I can decide whether to accept
19. As a user, I want to see accept and reject buttons for each file offer so that I can control what I receive
20. As a user, I want to see received files listed with progress so that I can track downloads
21. As a user, I want to see a download button for each completed file so that I can save it to my device
22. As a user, I want to see a visual indicator of download completion so that I confirm the file is ready

### Progress & Queue UI
23. As a user, I want to see a progress bar for each file transfer so that I can monitor progress
24. As a user, I want to see the percentage complete for each transfer so that I have precise information
25. As a user, I want to see the direction indicator (sending/receiving) for each file so that I know the flow
26. As a user, I want to see queued files listed separately so that I know what's waiting
27. As a user, I want to see the queue size (e.g., "3 files waiting") so that I know how many are pending
28. As a user, I want to see the total queue size in MB so that I can monitor storage usage

### Layout & Responsiveness
29. As a mobile user, I want the interface to adapt to my screen size so that I can use it comfortably
30. As a desktop user, I want the interface to use screen space efficiently so that I can see all information
31. As a user, I want clear visual hierarchy so that the most important actions are obvious
32. As a user, I want the QR code scanner to be full-screen on mobile so that scanning is easy
33. As a user, I want to see connection state changes animated/transitioned so that state changes are clear

## Implementation Decisions

### Modules
- **Connection Panel**: Display connection status, QR code generation, scanning controls
- **File Sender Panel**: File selection, preview, send controls
- **File Receiver Panel**: Incoming file offers, accept/reject controls
- **Transfer Progress Panel**: Progress bars, queue display, download buttons
- **QR Scanner Overlay**: Full-screen camera view for scanning
- **Notification System**: Toast messages for errors, status changes

### Components
- `QRCodeDisplay`: Renders QR code from data string
- `QRCodeScanner`: Full-screen camera scanner with zxing-js/browser
- `ConnectionStatus`: Shows current connection state (NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED)
- `FileSelectionInput`: File picker with multiple selection and size validation
- `FilePreviewList`: Shows files to be sent before confirmation
- `FileOfferNotification`: Modal/pop-up for incoming file offers with accept/reject
- `TransferList`: List of active, queued, and completed transfers
- `ProgressBar`: Visual progress indicator with percentage
- `DownloadButton`: Button to download completed file
- `QueueStatus`: Shows number and total size of queued files

### Page Layouts
- **Disconnected State**: Prominent "Create Connection" and "Scan QR" buttons
- **Connecting State (QR1)**: QR code display with "Waiting for response..." message
- **Connecting State (QR2)**: QR code display with "Scan the other device's QR code" message
- **Connected State**: File sender, transfer progress, connection info
- **File Offer Modal**: Overlay with file details and accept/reject buttons

### Visual Design
- Connection state indicated by color: gray (NEW), green (CONNECTED), blue (TRANSFERRING), red (FAILED), orange (CLOSED)
- Progress bars: green gradient fill, with percentage text
- Direction indicators: ↑ for sending, ↓ for receiving
- Download button: appears next to progress bar at 100%, checkmark icon when downloaded
- Queue indicator: badge with count and size

### Technical Decisions
- Use zxing-js/browser for QR scanning (ADR-0016)
- QR codes contain compressed signaling data (ADR-0012)
- Connection state machine drives UI (ADR-0010)
- File state machine drives file status display (ADR-0011)
- 500MB file limit enforced in UI (ADR-0005)
- Two-QR handshake flow (ADR-0003)

## Testing Decisions

### Test Strategy
- Test responsive design on various screen sizes
- Test QR code scanning from camera
- Test UI state changes based on connection state
- Test UI state changes based on file transfer state
- Test file offer modal appearance and interaction
- Test download button functionality
- Test error message display

### Modules to Test
- QR code scanner integration
- Connection state UI updates
- File transfer progress display
- File offer notification flow
- Download functionality
- Responsive layout

### Test Approach
- Manual testing on mobile (iOS, Android) and desktop browsers
- Visual regression tests for UI components
- Interaction tests for user flows
- Accessibility tests (keyboard navigation, screen readers)

## Out of Scope

- Core WebRTC connection logic (PRD-001)
- File transfer protocol implementation (PRD-002)
- Storage implementation (PRD-004)
- Backend server (entirely browser-based)

## Further Notes

- UI should show "IDLE" as CONNECTED state (no separate IDLE state)
- Transfer progress bars should be per-file, not global
- Direction indicator should be clear (e.g., "Sending: file.pdf" or "Receiving: file.pdf")
- Download button should appear immediately at 100% completion
- Downloaded files should show a checkmark or "Downloaded" text
- Queue status should show both count and total size
- Connection info should show peer device type if detectable (mobile/desktop)
