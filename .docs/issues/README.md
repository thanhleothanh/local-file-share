# Issues - Local File Share

This directory contains the implementation issues for the Local File Share application, organized as vertical tracer-bullet slices that deliver end-to-end functionality.

## Issue Overview

The implementation is divided into 16 issues, organized by dependency order. Each issue represents a thin vertical slice that delivers complete, demoable functionality.

### Dependency Graph

```
ISSUE-001: QR Code Connection Handshake (Foundation)
    │
    ├── ISSUE-002: File Offer and Accept Protocol
    │       │
    │       ├── ISSUE-003: File Chunking and Transfer
    │       │       │
    │       │       └── ISSUE-004: Queue Management and Limits
    │       │
    │       └── ISSUE-011: Bidirectional Transfer
    │
    ├── ISSUE-005: IndexedDB Storage and Persistence
    │       │
    │       └── (enables persistence across page reloads)
    │
    └── ISSUE-006: Connection UI
            │
            ├── ISSUE-007: File Sender UI
            │       │
            │       ├── ISSUE-009: Progress and Queue UI
            │       │
            │       └── (sender-specific features)
            │
            └── ISSUE-008: File Receiver UI
                    │
                    └── (receiver-specific features)

ISSUE-012: Error Handling and Recovery (can start after core modules)

ISSUE-010: Application Orchestration (requires all UI and protocol issues)
    │
    ├── ISSUE-013: Cross-Browser Testing and Validation
    ├── ISSUE-014: Performance and Stress Testing
    ├── ISSUE-015: Unit and Integration Tests
    └── ISSUE-016: End-to-End Tests
```

## Implementation Order

### Phase 1: Foundation (Can start immediately)
1. **ISSUE-001: QR Code Connection Handshake** - Core WebRTC + QR connection establishment

### Phase 2: Parallel Development (After ISSUE-001)
2. **ISSUE-002: File Offer and Accept Protocol** - File offer/accept over control channel
3. **ISSUE-005: IndexedDB Storage and Persistence** - Storage for chunks, metadata, state
4. **ISSUE-006: Connection UI** - QR display, scanning, connection status
5. **ISSUE-012: Error Handling and Recovery** - Comprehensive error management

### Phase 3: File Transfer (After ISSUE-002)
6. **ISSUE-003: File Chunking and Transfer** - Chunking, transfer, reassembly
7. **ISSUE-011: Bidirectional Transfer** - Both directions simultaneous

### Phase 4: Queue & UI (After ISSUE-003, ISSUE-006)
8. **ISSUE-004: Queue Management and Limits** - FIFO queue with 500MB limit
9. **ISSUE-007: File Sender UI** - File selection and sending UI
10. **ISSUE-008: File Receiver UI** - Offer notifications and downloads
11. **ISSUE-009: Progress and Queue UI** - Progress bars and queue display

### Phase 5: Integration (After all above)
12. **ISSUE-010: Application Orchestration** - Event bus, module coordination

### Phase 6: Testing (After ISSUE-010)
13. **ISSUE-015: Unit and Integration Tests** - Jest-based tests
14. **ISSUE-013: Cross-Browser Testing and Validation** - Browser compatibility
15. **ISSUE-014: Performance and Stress Testing** - Performance validation
16. **ISSUE-016: End-to-End Tests** - Complete user journey tests

## Issue List

| # | Title | Parent PRD | Blocked By | Type | Status |
|---|-------|------------|------------|------|--------|
| 001 | QR Code Connection Handshake | PRD-001 | None | AFK | done |
| 002 | File Offer and Accept Protocol | PRD-002 | 001 | AFK | pending |
| 003 | File Chunking and Transfer | PRD-002 | 001, 002 | AFK | pending |
| 004 | Queue Management and Limits | PRD-002 | 001, 002, 003 | AFK | pending |
| 005 | IndexedDB Storage and Persistence | PRD-004 | 001 | AFK | pending |
| 006 | Connection UI | PRD-003 | 001 | AFK | done |
| 007 | File Sender UI | PRD-003 | 001, 006 | AFK | pending |
| 008 | File Receiver UI | PRD-003 | 001, 006, 007 | AFK | pending |
| 009 | Progress and Queue UI | PRD-003 | 007, 008 | AFK | pending |
| 010 | Application Orchestration | PRD-005 | 001-009 | AFK | pending |
| 011 | Bidirectional Transfer | PRD-002 | 002, 003 | AFK | pending |
| 012 | Error Handling and Recovery | PRD-005 | 001, 005 | AFK | pending |
| 013 | Cross-Browser Testing and Validation | PRD-005 | 010 | HITL | pending |
| 014 | Performance and Stress Testing | PRD-005 | 010 | HITL | pending |
| 015 | Unit and Integration Tests | PRD-005 | 001-005 | AFK | pending |
| 016 | End-to-End Tests | PRD-005 | 010 | HITL | pending |

## Key Statistics

- **Total Issues**: 16
- **AFK (Autonomous)**: 14
- **HITL (Human-in-the-loop)**: 2 (testing-related)
- **Foundation**: 1 issue (ISSUE-001)
- **Core Protocol**: 5 issues (002-005, 011)
- **User Interface**: 5 issues (006-010, 009)
- **Testing**: 4 issues (012-016)
- **Integration**: 1 issue (010)
- **Completed**: 2 (ISSUE-001, ISSUE-006)
- **In Progress**: 0
- **Pending**: 14

## Vertical Slice Principles

Each issue follows tracer-bullet principles:
- **Narrow but COMPLETE**: Cuts through all layers (UI, protocol, storage)
- **Demoable**: Can be tested and verified independently
- **End-to-end**: Delivers user-visible functionality
- **Minimal dependencies**: Only depends on what's strictly necessary

## Quick Start

To begin implementation, start with **ISSUE-001: QR Code Connection Handshake** as it's the foundation for all other features.

## See Also

- [PRDs](../prds/) - Product Requirements Documents
- [ADRs](../adr/) - Architecture Decision Records
- [Contexts](../contexts/) - Domain contexts and ubiquitous language
