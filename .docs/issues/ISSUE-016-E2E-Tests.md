# ISSUE-016: End-to-End Tests

## Parent
PRD-005: Integration and Testing

## What to build
Implement end-to-end tests that validate complete user journeys through the application.

## Acceptance criteria
- [ ] E2E test for basic transfer: Create connection, send file, receive file, download
- [ ] E2E test for bidirectional: Device A sends to B, then B sends to A
- [ ] E2E test for multiple files: Queue multiple files, verify sequential transfer
- [ ] E2E test for large file: Send 500MB file (or simulate), verify completion
- [ ] E2E test for connection timeout: Wait 5 minutes idle, verify auto-close
- [ ] E2E test for rejection: Offer file, receiver rejects, verify cleanup
- [ ] E2E test for queue limit: Offer files beyond 500MB, verify rejection
- [ ] E2E test for page reload: Start transfer, reload page, verify recovery
- [ ] E2E test for mobile to desktop transfer
- [ ] E2E test for desktop to mobile transfer
- [ ] E2E test for mobile to mobile transfer (if possible)
- [ ] All E2E tests run successfully
- [ ] E2E tests can run on CI (or locally with browser automation)
- [ ] Test reports generated for each run

## Blocked by
- ISSUE-010 (Application Orchestration - complete application needed)

## User stories covered
9. As a developer, I want end-to-end tests for user journeys so that I can validate the complete experience

## Notes
- Use Puppeteer, Playwright, or Cypress for browser automation
- Tests may need to run on real devices for mobile scenarios
- Page reload test requires IndexedDB persistence
- Connection timeout test requires waiting 5 minutes (or mocking time)
- Large file test may need to use simulated/chunked approach for speed
- E2E tests should be reliable and repeatable
- Test data should be cleaned up after each test
