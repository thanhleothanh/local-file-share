# PRDs - Local File Share

This directory contains the Product Requirements Documents (PRDs) for the Local File Share application.

## Overview

The Local File Share application is a browser-only, peer-to-peer file sharing solution for devices on the same local network. It uses WebRTC for direct file transfers and QR codes for connection establishment, with no external servers required.

## PRD Structure

The implementation is divided into 5 PRDs, each focusing on a specific aspect of the application:

| PRD | Title | Description | Dependencies |
|-----|-------|-------------|--------------|
| [PRD-001](PRD-001-Core-Infrastructure.md) | Core Infrastructure | WebRTC connection establishment, QR code handling, state management | None |
| [PRD-002](PRD-002-File-Transfer-Protocol.md) | File Transfer Protocol | Chunking, queuing, binary protocol, progress tracking | PRD-001 |
| [PRD-003](PRD-003-User-Interface.md) | User Interface | QR scanning, file selection, progress display | PRD-001, PRD-002 |
| [PRD-004](PRD-004-Storage-and-State-Persistence.md) | Storage & State | IndexedDB storage, persistence, cleanup | PRD-001, PRD-002 |
| [PRD-005](PRD-005-Integration-and-Testing.md) | Integration & Testing | Application orchestration, testing strategy | PRD-001, PRD-002, PRD-003, PRD-004 |

## Suggested Implementation Order

1. **PRD-001: Core Infrastructure** - Foundation for all other features
2. **PRD-004: Storage & State** - Required for file transfer persistence
3. **PRD-002: File Transfer Protocol** - Core file transfer logic
4. **PRD-003: User Interface** - Visual interface for users
5. **PRD-005: Integration & Testing** - Final integration and comprehensive testing

## Key Architectural Decisions

All PRDs implement the following architectural decisions from the ADRs:

- **Pure browser-based** with no servers (ADR-0001)
- **WebRTC** for P2P file transfer (ADR-0002)
- **Two-QR handshake** for connection establishment (ADR-0003)
- **Connection secret** in QR codes for authentication (ADR-0004)
- **500MB file limit** universal (ADR-0005)
- **Fail-fast** error handling (ADR-0006)
- **Separate data channels** for control and data (ADR-0007)
- **Batch processing** for memory-efficient downloads (ADR-0008)
- **FIFO queue** with 500MB size limit (ADR-0009)
- **Connection state machine** with idle timeout (ADR-0010)
- **File state machine** for transfer lifecycle (ADR-0011)
- **QR compression** with gzip + base64 (ADR-0012)
- **JSON + binary** message format (ADR-0013)
- **41-byte binary header** for data channel (ADR-0014)
- **8KB chunk size** (ADR-0015)
- **zxing-js/browser** for QR scanning (ADR-0016)
- **1:1 connections only** (ADR-0017)
- **Discard queued files** on connection close (ADR-0018)

## Testing Strategy Summary

- **Unit Tests**: >100 tests covering core logic
- **Integration Tests**: 30-40 tests covering component interactions
- **E2E Tests**: 10-15 tests covering user journeys
- **Cross-Browser**: All tier-1 browsers (Chrome, Firefox, Edge, Safari, iOS Safari, Android Chrome)
- **Performance**: Memory usage, throughput, connection time

## Delivery Checklist

- [ ] PRD-001: Core Infrastructure implemented and tested
- [ ] PRD-002: File Transfer Protocol implemented and tested
- [ ] PRD-003: User Interface implemented and tested
- [ ] PRD-004: Storage & State implemented and tested
- [ ] PRD-005: Integration complete, all tests passing
- [ ] Cross-browser validation complete
- [ ] Performance tests meet requirements
- [ ] Manual testing complete

## Quick Links

- [ADRs](../adr/) - Architecture Decision Records
- [Contexts](../contexts/) - Domain contexts and ubiquitous language
- [README](../README.md) - Documentation index
