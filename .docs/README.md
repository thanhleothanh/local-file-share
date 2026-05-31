# Local File Share - Documentation

This directory contains the architecture documentation for the Local File Share application, a browser-based file sharing solution for local networks.

## Structure

```
.docs/
├── README.md                    # This file
├── contexts/
│   ├── CONTEXT-MAP.md           # Overview of all contexts
│   └── 0001-CONTEXT-file-sharing.md  # File Sharing context & ubiquitous language
├── adr/
│   ├── 0001-browser-only-no-servers.md
│   ├── 0002-webrtc-for-file-transfer.md
│   ├── 0003-two-qr-handshake.md
│   ├── 0004-connection-secret-in-qr.md
│   ├── 0005-500mb-file-limit.md
│   ├── 0006-fail-fast-error-handling.md
│   ├── 0007-separate-data-channels.md
│   ├── 0008-batch-processing-for-downloads.md
│   ├── 0009-fifo-queue-with-size-limit.md
│   ├── 0010-connection-state-machine.md
│   ├── 0011-file-state-machine.md
│   ├── 0012-qr-compression.md
│   ├── 0013-message-format.md
│   ├── 0014-binary-header-format.md
│   ├── 0015-chunk-size-8kb.md
│   ├── 0016-zxing-js-browser.md
│   ├── 0017-1-to-1-connections-only.md
│   ├── 0018-discard-queued-on-close.md
│   ├── 0019-html5-es6-browser-only.md
│   ├── 0020-webrtc-data-channels.md
│   ├── 0021-indexeddb-for-storage.md
│   ├── 0022-zxing-js-browser-for-qr.md
│   ├── 0023-pako-for-gzip-compression.md
│   └── 0024-uuid-library-for-ids.md
└── prds/
    ├── README.md                # PRD index
    ├── PRD-001-Core-Infrastructure.md
    ├── PRD-002-File-Transfer-Protocol.md
    ├── PRD-003-User-Interface.md
    ├── PRD-004-Storage-and-State-Persistence.md
    └── PRD-005-Integration-and-Testing.md
```

## Quick Start

1. **Understand the domain**: Read `contexts/0001-CONTEXT-file-sharing.md` for ubiquitous language
2. **Architecture overview**: Review ADR-0001 through ADR-0003 for core decisions
3. **Detailed decisions**: Browse remaining ADRs for specific design choices
4. **Implementation plan**: Review PRDs for implementation roadmap

## Product Requirements Documents (PRDs)

| # | Title | Description | Dependencies |
|---|-------|-------------|--------------|
| PRD-001 | Core Infrastructure | WebRTC connection establishment, QR code handling, state management | None |
| PRD-002 | File Transfer Protocol | Chunking, queuing, binary protocol, progress tracking | PRD-001 |
| PRD-003 | User Interface | QR scanning, file selection, progress display | PRD-001, PRD-002 |
| PRD-004 | Storage & State | IndexedDB storage, persistence, cleanup | PRD-001, PRD-002 |
| PRD-005 | Integration & Testing | Application orchestration, testing strategy | All |

See [prds/README.md](prds/README.md) for full PRD documentation.

## Architecture Decision Records (ADRs)

| # | Title | Status | Date |
|---|-------|--------|------|
| 1 | Browser-Only with No External Servers | Accepted | 2026-05-31 |
| 2 | WebRTC for Peer-to-Peer File Transfer | Accepted | 2026-05-31 |
| 3 | Two-QR Code Handshake for Connection Establishment | Accepted | 2026-05-31 |
| 4 | Connection Secret in QR Codes | Accepted | 2026-05-31 |
| 5 | 500MB Universal File Size Limit | Accepted | 2026-05-31 |
| 6 | Fail-Fast Error Handling | Accepted | 2026-05-31 |
| 7 | Separate Data Channels for Control and Data | Accepted | 2026-05-31 |
| 8 | Batch Processing for File Downloads | Accepted | 2026-05-31 |
| 9 | FIFO Queue with 500MB Size Limit | Accepted | 2026-05-31 |
| 10 | Connection State Machine | Accepted | 2026-05-31 |
| 11 | File State Machine | Accepted | 2026-05-31 |
| 12 | QR Code Compression for WebRTC Signaling | Accepted | 2026-05-31 |
| 13 | Message Format: JSON + Binary | Accepted | 2026-05-31 |
| 14 | Binary Header Format for Data Channel | Accepted | 2026-05-31 |
| 15 | 8KB Chunk Size | Accepted | 2026-05-31 |
| 16 | zxing-js/browser for QR Code Scanning | Accepted | 2026-05-31 |
| 17 | 1:1 Connections Only | Accepted | 2026-05-31 |
| 18 | Discard Queued Files on Connection Close | Accepted | 2026-05-31 |
| 19 | HTML5 + ES6+ for Browser-Only Application | Accepted | 2026-05-31 |
| 20 | WebRTC Data Channels for Direct P2P Communication | Accepted | 2026-05-31 |
| 21 | IndexedDB for Browser Storage | Accepted | 2026-05-31 |
| 22 | zxing-js/browser for QR Code Scanning and Generation | Accepted | 2026-05-31 |
| 23 | Pako for Gzip Compression | Accepted | 2026-05-31 |
| 24 | UUID Library for Unique Identifiers | Accepted | 2026-05-31 |

## Key Decisions Summary

### Core Architecture
- **Pure browser-based** with no servers (ADR-0001)
- **WebRTC** for P2P file transfer (ADR-0002)
- **2-QR handshake** for connection establishment (ADR-0003)
- **Connection secret** in QR for authentication (ADR-0004)

### Limits & Constraints
- **500MB file limit** universal (ADR-0005)
- **Fail-fast** error handling (ADR-0006)
- **1:1 connections only** (ADR-0017)
- **Queue size limit**: 500MB for queued files (ADR-0009)

### Protocol
- **Separate data channels**: control (JSON) + data (binary) (ADR-0007)
- **Message format**: JSON for control, binary with header for data (ADR-0013, ADR-0014)
- **Chunk size**: 8KB (ADR-0015)
- **QR compression**: gzip + base64 (ADR-0012)
- **QR library**: zxing-js/browser (ADR-0016)

### State Management
- **Connection states**: NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED (ADR-0010)
- **File states**: PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED (ADR-0011)
- **Idle timeout**: 5 minutes in CONNECTED, reset on network activity (ADR-0010)
- **Cleanup**: Discard queued files on close (ADR-0018)

### Download
- **Batch processing** for memory efficiency (ADR-0008)
