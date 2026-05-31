# ISSUE-015: Unit and Integration Tests

## Parent
PRD-005: Integration and Testing

## What to build
Implement comprehensive unit and integration tests for all core modules to ensure correctness and prevent regressions.

## Acceptance criteria
- [x] Unit tests for QR code compression/decompression logic (part of Jest tests)
- [ ] Unit tests for WebRTC signaling message parsing (requires complex WebRTC mocking)
- [ ] Unit tests for connection state machine transitions (requires WebRTC mocking)
- [x] Unit tests for file state machine transitions (fileState.test.js)
- [x] Unit tests for file chunking with header creation (chunkHandler.test.js)
- [ ] Unit tests for file reassembly from chunks (requires data channel mocking)
- [ ] Unit tests for queue management logic (requires fileTransfer mocking)
- [x] Unit tests for progress calculation (fileState.test.js)
- [ ] Unit tests for IndexedDB storage operations (requires IndexedDB mocking)
- [ ] Unit tests for control message serialization/deserialization (requires message handler mocking)
- [ ] Integration tests for QR code offer generation → scanning → answer generation → scanning → connection established
- [ ] Integration tests for file offer → accept → transfer start → chunks sent → reassembly → completion
- [ ] Integration tests for multiple files queued → sequential transfer
- [ ] Integration tests for file offer → reject → cleanup
- [ ] Integration tests for connection close → all data cleanup
- [ ] Integration tests for connection timeout → automatic close
- [ ] Integration tests for 1:1 enforcement → reject new connection when active
- [ ] Test coverage > 80% for all modules
- [x] All tests run successfully in CI environment (Jest configured and running)
- [x] Test suite runs in < 30 seconds (currently ~1s)

## Blocked by
- ISSUE-001 (QR Code Connection Handshake)
- ISSUE-002 (File Offer and Accept Protocol)
- ISSUE-003 (File Chunking and Transfer)
- ISSUE-004 (Queue Management and Limits)
- ISSUE-005 (IndexedDB Storage and Persistence)

## User stories covered
7. As a developer, I want unit tests for all core modules so that I can catch regressions
8. As a developer, I want integration tests for component interactions so that I can verify the system works

## Notes
- Use Jest or similar test framework
- Use jsdom for browser environment in tests
- Mock WebRTC for unit tests
- Use real IndexedDB in integration tests
- Test both happy paths and error paths
- Include edge cases (empty files, boundary conditions, etc.)
- Tests should be fast and reliable
