# Local File Share - Documentation

This directory contains the architecture documentation for the Local File Share application, a browser-based file sharing solution for local networks.

## Structure

```
.docs/
├── README.md                    # This file
├── contexts/
│   ├── CONTEXT-MAP.md           # Overview of all contexts
│   └── 0001-CONTEXT-file-sharing.md  # File Sharing context & ubiquitous language
└── adr/
    ├── 0001-browser-only-no-servers.md
    ├── 0002-webrtc-for-file-transfer.md
    ├── 0003-two-qr-handshake.md
    ├── 0004-connection-secret-in-qr.md
    ├── 0005-500mb-file-limit.md
    ├── 0006-fail-fast-error-handling.md
    ├── 0007-separate-data-channels.md
    ├── 0008-batch-processing-for-downloads.md
    ├── 0009-fifo-queue-with-size-limit.md
    ├── 0010-connection-state-machine.md
    ├── 0011-file-state-machine.md
    ├── 0012-qr-compression.md
    ├── 0013-message-format.md
    ├── 0014-binary-header-format.md
    ├── 0015-chunk-size-8kb.md
    ├── 0016-zxing-js-browser.md
    ├── 0017-1-to-1-connections-only.md
    ├── 0018-discard-queued-on-close.md
    ├── 0019-html5-es6-browser-only.md
    ├── 0020-webrtc-data-channels.md
    ├── 0021-indexeddb-for-storage.md
    ├── 0022-zxing-js-browser-for-qr.md
    ├── 0023-pako-for-gzip-compression.md
    ├── 0024-uuid-library-for-ids.md
    ├── 0025-file-received-ack-and-nack.md
    ├── 0026-sctp-backpressure-bufferedamountlow.md
    ├── 0027-unified-files-tab.md
    └── 0028-connection-tab-3-step-progress.md
```

## Quick Start

1. **Understand the domain**: Read `contexts/0001-CONTEXT-file-sharing.md` for ubiquitous language
2. **Architecture overview**: Review ADR-0001 through ADR-0003 for core decisions
3. **Detailed decisions**: Browse remaining ADRs for specific design choices

## Architecture Decision Records (ADRs)

| #   | Title                                                       | Status   | Date       |
| --- | ----------------------------------------------------------- | -------- | ---------- |
| 1   | Browser-Only with No External Servers                       | Accepted | 2026-05-31 |
| 2   | WebRTC for Peer-to-Peer File Transfer                       | Accepted | 2026-05-31 |
| 3   | Two-QR Code Handshake for Connection Establishment          | Accepted | 2026-05-31 |
| 4   | Connection Secret in QR Codes                               | Accepted | 2026-05-31 |
| 5   | 500MB Universal File Size Limit                             | Accepted | 2026-05-31 |
| 6   | Fail-Fast Error Handling                                    | Accepted | 2026-05-31 |
| 7   | Separate Data Channels for Control and Data                 | Accepted | 2026-05-31 |
| 8   | Batch Processing for File Downloads                         | Accepted | 2026-05-31 |
| 9   | FIFO Queue with 500MB Size Limit                            | Accepted | 2026-05-31 |
| 10  | Connection State Machine                                    | Accepted | 2026-05-31 |
| 11  | File State Machine                                          | Accepted | 2026-05-31 |
| 12  | QR Code Compression for WebRTC Signaling                    | Accepted | 2026-05-31 |
| 13  | Message Format: JSON + Binary                               | Accepted | 2026-05-31 |
| 14  | Binary Header Format for Data Channel                       | Accepted | 2026-05-31 |
| 15  | 8KB Chunk Size                                              | Accepted | 2026-05-31 |
| 16  | zxing-js/browser for QR Code Scanning                       | Accepted | 2026-05-31 |
| 17  | 1:1 Connections Only                                        | Accepted | 2026-05-31 |
| 18  | Discard Queued Files on Connection Close                    | Accepted | 2026-05-31 |
| 19  | HTML5 + ES6+ for Browser-Only Application                   | Accepted | 2026-05-31 |
| 20  | WebRTC Data Channels for Direct P2P Communication           | Accepted | 2026-05-31 |
| 21  | IndexedDB for Browser Storage                               | Accepted | 2026-05-31 |
| 22  | zxing-js/browser for QR Code Scanning and Generation        | Accepted | 2026-05-31 |
| 23  | Pako for Gzip Compression                                   | Accepted | 2026-05-31 |
| 24  | UUID Library for Unique Identifiers                         | Accepted | 2026-05-31 |
| 25  | FILE_RECEIVED Acknowledgement and NACK-Based Retransmit     | Accepted | 2026-06-01 |
| 26  | SCTP Backpressure via `bufferedamountlow`                   | Accepted | 2026-06-01 |
| 27  | Unified Files Tab with Filter Chips                         | Accepted | 2026-06-01 |
| 28  | Connection Tab: 3-Step Dot Progress with State-Driven Panes | Accepted | 2026-06-02 |

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
- **Queue size limit**: 500MB for queued files (ADR-0009, SEND-only)

### Protocol

- **Separate data channels**: control (JSON) + data (binary) (ADR-0007)
- **Reliable channels**: no `maxRetransmits: 0` (ADR-0025)
- **SCTP backpressure**: `bufferedAmountLowThreshold: 1 MiB` + Promise-returning `sendDataMessage` (ADR-0026)
- **Sender ack gate**: file is `COMPLETED` on the sender only when the receiver sends `FILE_RECEIVED` (ADR-0025, 30 s timeout)
- **NACK-based retransmit**: receiver requests missing chunks from the sender's `sentChunkCache`, bounded at 3 rounds (ADR-0025)
- **Count-driven assembly**: receiver assembles when chunk count matches, `isLast` only triggers a NACK check (ADR-0025)
- **Message format**: JSON for control, binary with header for data (ADR-0013, ADR-0014)
- **Chunk size**: 8KB (ADR-0015)
- **QR compression**: gzip + base64 (ADR-0012)
- **QR library**: zxing-js/browser (ADR-0016)

### State Management

- **Connection states**: NEW, CONNECTED, TRANSFERRING, FAILED, CLOSED (ADR-0010)
- **File states**: PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED (ADR-0011)
- **State group**: Active (PENDING/QUEUED/TRANSFERRING) vs Done (terminal) for the Files tab chips (ADR-0011, ADR-0027)
- **Idle timeout**: 5 minutes in CONNECTED, reset on network activity (ADR-0010)
- **Cleanup**: Discard queued files on close (ADR-0018)

### Files Tab (M2 redesign, ADR-0027)

- **Unified list** of send + receive, with **All / Active / Done** filter chips
- **No sender progress bar** (sender has no real-time progress signal)
- **No `Download` button** on completed receives (auto-downloaded; chunk data not persisted)
- **FAB anchored to the panel**, not the viewport
- **Mobile-first** single column; same layout on both peers

### Connection Tab (M2 redesign, ADR-0028)

- **3-dot progress bar**: Offer → Answer → Connected
- **State-driven panes** (`currentStep` × `connectionRole`), no modal
- **Step 3 dot is green and heartbeating** when active (signals "we are live"; `prefers-reduced-motion` disables the animation)
- **Step 2 initiator camera is always-on** while the pane is visible (auto-started/stopped by `updateUI` from `wantAnswerScanner`); no button to tap
- **Manual advance** for the initiator's "Proceed to scan Answer QR from other device" button (gives joiner a guaranteed scan window)
- **Step 3 device cards** with "You" badge on the local device; peer is a generic placeholder (no new control messages)
- **No in-app disconnect** — the user disconnects by reloading the page (the step-3 view shows a hint)
- **Silent FAILED transition** on peer-disconnect: the surviving device snaps back to step 1 immediately, no "Connection failed" / "ICE negotiation failed" dialogs (would be asymmetric with the other device's clean reload)
- **SOLID `disconnect`** as a composition root: `disconnect = teardownConnection + resetToIdle`. Kept in the module for tests and code organization; not on `window`
- **Denser QR codes**: `MARGIN: 2` zxing hint + 400 px default + `0.25rem` CSS padding, so the modules fill more of the visible area

### Download

- **Batch processing** for memory efficiency (ADR-0008)
