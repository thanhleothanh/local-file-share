# PRD-005: Integration and Testing

## Problem Statement

All modules from PRD-001 through PRD-004 need to be integrated into a cohesive application, with comprehensive testing to ensure the file sharing functionality works correctly across all supported platforms.

## Solution

Integrate all components into a single-page application and establish a testing strategy that covers unit tests, integration tests, end-to-end tests, and cross-platform validation.

## User Stories

### Application Integration
1. As a user, I want all features to work together seamlessly so that I can share files without issues
2. As a user, I want the application to work on both desktop and mobile browsers so that I can use it on any device
3. As a user, I want the application to work on iOS Safari, Android Chrome, and desktop browsers so that cross-platform sharing works
4. As a user, I want clear error messages when something goes wrong so that I can troubleshoot
5. As a user, I want to see a loading indicator during application initialization so that I know it's working
6. As a user, I want the application to be a single HTML file so that deployment is trivial

### Testing & Quality
7. As a developer, I want unit tests for all core modules so that I can catch regressions
8. As a developer, I want integration tests for component interactions so that I can verify the system works
9. As a developer, I want end-to-end tests for user journeys so that I can validate the complete experience
10. As a developer, I want cross-browser tests so that I can ensure compatibility
11. As a developer, I want performance tests so that I can ensure the application handles large files
12. As a developer, I want memory usage tests so that I can verify there are no leaks

## Implementation Decisions

### Modules
- **Application Orchestrator**: Main coordinator that initializes all modules and handles their interactions
- **Event Bus**: Pub/sub system for communication between modules (connection events, file events, UI events)
- **Error Handler**: Central error handling with logging and user feedback
- **Test Harness**: Test infrastructure for unit, integration, and E2E tests
- **Demo/Manual Test Page**: Simple test page for manual validation

### Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Orchestrator                     │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────┐│
│  │   PRD-001    │  │   PRD-002    │  │   PRD-003    │  │PRD-004││
│  │  Core Infra  │  │ Transfer     │  │    UI        │  │ Storage││
│  │             │  │ Protocol     │  │              │  │        ││
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──┬────┘│
│         │                │                │              │      │
│         └────────────────┴────────────────┴──────────────┘      │
│                              Event Bus                                 │
│                         (Pub/Sub System)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Interfaces
- `AppOrchestrator.init()` - Initialize all modules and set up event subscriptions
- `AppOrchestrator.start()` - Start the application
- `EventBus.publish(eventType, data)` - Publish an event to subscribers
- `EventBus.subscribe(eventType, callback)` - Subscribe to events
- `ErrorHandler.report(error, context)` - Report error with context
- `ErrorHandler.showUserError(message)` - Display error to user

### Event Types
- **Connection Events**: `CONNECTION_NEW`, `CONNECTION_CONNECTED`, `CONNECTION_TRANSFERRING`, `CONNECTION_FAILED`, `CONNECTION_CLOSED`
- **File Events**: `FILE_OFFERED`, `FILE_ACCEPTED`, `FILE_REJECTED`, `FILE_QUEUED`, `FILE_TRANSFERRING`, `FILE_COMPLETED`, `FILE_FAILED`, `FILE_CANCELLED`
- **Transfer Events**: `TRANSFER_STARTED`, `TRANSFER_PROGRESS`, `TRANSFER_COMPLETED`
- **UI Events**: `UI_QrScanned`, `UI_FileSelected`, `UI_AcceptClicked`, `UI_RejectClicked`, `UI_DownloadClicked`, `UI_CloseClicked`
- **Storage Events**: `STORAGE_FILE_SAVED`, `STORAGE_FILE_DOWNLOADED`, `STORAGE_CLEANUP`

### Application Entry Point
- Single HTML file with embedded JavaScript (or separate JS files bundled)
- Minimal dependencies: zxing-js/browser, pako (for gzip), uuid
- No build process required for development (can use CDN for dependencies)
- Production: can be bundled into single file

## Testing Decisions

### Test Pyramid
```
          E2E Tests (10-15)
             ↑
        Integration Tests (30-40)
             ↑
        Unit Tests (100+)
```

### Unit Tests
**Modules to test:**
- QR code compression/decompression
- WebRTC signaling message parsing
- Connection state machine
- File state machine
- File chunking with header creation
- File reassembly from chunks
- Queue management
- Progress calculation
- IndexedDB storage operations
- Control message serialization/deserialization

**Test framework:** Jest or similar, with browser environment (jsdom)

### Integration Tests
**Scenarios to test:**
- QR code offer generation → scanning → answer generation → scanning → connection established
- File offer → accept → transfer start → chunks sent → reassembly → completion
- Multiple files queued → sequential transfer
- File offer → reject → cleanup
- Connection close → all data cleanup
- Connection timeout → automatic close
- 1:1 enforcement → reject new connection when active

**Test approach:** Mock WebRTC, use real IndexedDB in test environment

### End-to-End Tests
**User journeys to test:**
1. **Basic Transfer**: Create connection, send file, receive file, download
2. **Bidirectional**: Device A sends to B, then B sends to A
3. **Multiple Files**: Queue multiple files, verify sequential transfer
4. **Large File**: Send 500MB file (or simulate), verify completion
5. **Connection Timeout**: Wait 5 minutes idle, verify auto-close
6. **Rejection**: Offer file, receiver rejects, verify cleanup
7. **Queue Limit**: Offer files beyond 500MB, verify rejection
8. **Page Reload**: Start transfer, reload page, verify recovery

**Test approach:** Use browser automation (Puppeteer, Playwright, Cypress)

### Cross-Browser Testing
**Browsers to test:**
- Desktop: Chrome, Firefox, Edge, Safari
- Mobile: iOS Safari (iPhone, iPad), Android Chrome
- Tablet: iPad Safari, Android Tablet Chrome

**Test matrix:**
| Scenario | Chrome | Firefox | Edge | Safari | iOS Safari | Android Chrome |
|----------|--------|---------|------|--------|------------|-----------------|
| Connection | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| File Transfer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| QR Scanning | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Large File | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Page Reload | ✓ | ✓ | ✓ | ✓ | - | ✓ |

### Performance Testing
**Metrics to test:**
- Connection establishment time
- File transfer speed (throughput)
- Memory usage during transfer
- Memory usage with multiple queued files
- CPU usage during compression/decompression
- Battery impact on mobile

**Test approach:** Performance profiling, memory snapshots, battery monitoring

### Manual Testing
**Test cases:**
- Basic transfer between two desktop browsers
- Transfer from desktop to mobile
- Transfer from mobile to desktop
- Transfer from mobile to mobile
- Interrupt transfer (close tab, lose connection)
- Network conditions (slow, fast, intermittent)
- Edge cases (exactly 500MB file, empty file, special characters in filename)

## Out of Scope

- Continuous integration/deployment setup
- Performance optimization (beyond meeting requirements)
- Accessibility compliance (beyond basic functionality)
- Internationalization/localization

## Further Notes

### Single File Deployment
The application should be distributable as a single HTML file for maximum ease of deployment. This can be achieved by:
- Using CDN for dependencies (zxing-js, pako, uuid)
- Embedding CSS and JavaScript directly in HTML
- Or using a bundler for production

### Error Handling Strategy
- All errors should be caught and reported to ErrorHandler
- User-facing errors should be clear and actionable
- Technical errors should be logged to console for debugging
- Fail-fast: critical errors (storage, WebRTC) should close connection

### Debugging Support
- Verbose logging in development mode
- Connection state visualization
- File transfer progress logging
- Storage usage logging
- WebRTC ICE candidate logging

### Test Coverage Goals
- Unit tests: >80% code coverage
- Integration tests: All critical paths
- E2E tests: All primary user journeys
- Browser support: All tier-1 browsers (Chrome, Firefox, Edge, Safari, iOS Safari, Android Chrome)
