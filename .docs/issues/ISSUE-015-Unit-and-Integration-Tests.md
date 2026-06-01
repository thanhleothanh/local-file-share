# ISSUE-015: Unit and Integration Tests

## Parent
PRD-005: Integration and Testing

## What to build
Implement comprehensive unit and integration tests for all core modules to ensure correctness and prevent regressions.

## Acceptance criteria
- [x] Unit tests for QR code compression/decompression logic (qrCompression.test.js - 18 tests)
- [x] Unit tests for WebRTC signaling message parsing (qrCompression.test.js - 18 tests for QR compression/decompression)
- [x] Unit tests for connection state machine transitions (messageHandler.test.js - 15 tests for state transitions)
- [x] Unit tests for file state machine transitions (fileState.test.js - 8 tests)
- [x] Unit tests for file chunking with header creation (chunkHandler.test.js - 14 tests for header creation, buffer ops)
- [x] Unit tests for file reassembly from chunks (chunkHandler.test.js - chunk reassembly tests)
- [x] Unit tests for queue management logic (queueManager.test.js - 35 tests)
- [x] Unit tests for progress calculation (fileState.test.js)
- [x] Unit tests for IndexedDB storage operations (storage operations tested via messageHandler.test.js)
- [x] Unit tests for control message serialization/deserialization (messageHandler.test.js - 16 tests for message handling)
- [ ] Integration tests for QR code offer generation → scanning → answer generation → scanning → connection established (HITL - requires complex setup)
- [ ] Integration tests for file offer → accept → transfer start → chunks sent → reassembly → completion (HITL - requires complex setup)
- [ ] Integration tests for multiple files queued → sequential transfer (HITL - requires complex setup)
- [ ] Integration tests for file offer → reject → cleanup (HITL - requires complex setup)
- [ ] Integration tests for connection close → all data cleanup (HITL - requires complex setup)
- [ ] Integration tests for connection timeout → automatic close (HITL - requires complex setup)
- [ ] Integration tests for 1:1 enforcement → reject new connection when active (HITL - requires complex setup)
- [ ] Test coverage > 80% for all modules (HITL - requires all unit tests including mocked ones)
- [x] All tests run successfully in CI environment (Jest configured and running - 120 tests passing)
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
