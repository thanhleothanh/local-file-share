# ISSUE-006: Connection UI

## Parent
PRD-003: User Interface

## What to build
Implement the user interface for connection establishment, including QR code display, scanning, and connection status.

## Acceptance criteria
- [ ] Clean landing page with clear instructions
- [ ] Prominent "Create Connection" button
- [ ] Prominent "Scan QR Code" button
- [ ] "Create Connection" generates and displays OFFER QR code
- [ ] QR code display is large and clearly visible
- [ ] "Waiting for response..." message shown after QR1 generation
- [ ] "Scan QR Code" opens full-screen camera scanner on mobile
- [ ] Scanner uses device camera (mobile or desktop webcam)
- [ ] Scanner successfully reads OFFER and ANSWER QR codes
- [ ] After scanning OFFER, "Generate Answer QR" button appears
- [ ] ANSWER QR code is displayed for initiator to scan
- [ ] Connection state displayed: NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED
- [ ] Connection state uses color coding: gray, green, blue, red, orange
- [ ] State transitions are animated/visible
- [ ] Connection info shows peer device type if detectable
- [ ] Disconnect/Close button available when connected
- [ ] Error messages displayed clearly for invalid QR codes
- [ ] Error messages displayed for connection failures
- [ ] Camera scanner is full-screen on mobile for easy scanning
- [ ] UI adapts to mobile screen sizes
- [ ] UI uses screen space efficiently on desktop

## Blocked by
- ISSUE-001 (QR Code Connection Handshake - provides underlying connection logic)

## User stories covered
1. As a new user, I want to see clear instructions on how to start sharing files so that I know what to do
2. As a user, I want to see a "Create Connection" button so that I can initiate a connection
3. As a user, I want to see my generated QR code prominently displayed so that another device can scan it
4. As a user, I want to see a "Scan QR Code" button so that I can scan another device's QR code
5. As a user, I want camera access to work seamlessly on mobile so that I can scan QR codes
6. As a user, I want to see connection status messages so that I know if connection is pending, connected, or failed
7. As a user, I want to see the second QR code displayed after scanning the first so that I can complete the handshake
8. As a user, I want to see an error message if QR code scanning fails so that I can retry
9. As a user, I want to see a disconnect/close button so that I can end the connection
29. As a mobile user, I want the interface to adapt to my screen size so that I can use it comfortably
30. As a desktop user, I want the interface to use screen space efficiently so that I can see all information
31. As a user, I want clear visual hierarchy so that the most important actions are obvious
32. As a user, I want the QR code scanner to be full-screen on mobile so that scanning is easy
33. As a user, I want to see connection state changes animated/transitioned so that state changes are clear

## Notes
- Uses zxing-js/browser for QR scanning (ADR-0016)
- Connection state machine drives UI (ADR-0010)
- UI shows "IDLE" as CONNECTED state (no separate IDLE state)
- QR code scanner should be easily accessible from main UI
