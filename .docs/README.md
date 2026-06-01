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
    └── 0027-unified-files-tab.md
```

## Quick Start

1. **Understand the domain**: Read `contexts/0001-CONTEXT-file-sharing.md` for ubiquitous language
2. **Architecture overview**: Review ADR-0001 through ADR-0003 for core decisions
3. **Detailed decisions**: Browse remaining ADRs for specific design choices

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
| 25 | FILE_RECEIVED Acknowledgement and NACK-Based Retransmit | Accepted | 2026-06-01 |
| 26 | SCTP Backpressure via `bufferedamountlow` | Accepted | 2026-06-01 |
| 27 | Unified Files Tab with Filter Chips | Accepted | 2026-06-01 |

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

### Download
- **Batch processing** for memory efficiency (ADR-0008)

## Branch Changelog

Each branch that lands in `master` gets a brief changelog entry here so that
reviewers can see at a glance what changed, what bug was fixed, and which
ADRs/PRD sections were added or updated.

### `feature/fix-file-transfer` (in progress) — fork point `4db9845`

7 commits, ~2.2k lines added, 198 regression tests passing. The branch fixes
every major file-transfer bug surfaced during end-to-end testing and lands
the M2 Files tab redesign.

| Commit | One-line |
|--------|----------|
| `first fix`   | Wiring fixes: UI events on both peers, files reaching 98 % and stalling, image corruption from dropped chunks |
| `second fix`  | First file works; second file stuck at `QUEUED`, duplicate chunks, missing `isLast=1` |
| `third fix`   | Multiple files advance; receiver no longer sticks at 98 %; `isLast` still missing |
| `fourth fix`  | Every chunk now carries `isLast`; large files (> 2412 chunks ≈ 19 MB) still lose the data channel mid-send |
| `fifth fix`   | SCTP backpressure; 500 MB transfers complete end-to-end (bidirectional still broken) |
| `sixth fix`   | Bidirectional flow: `sendFileAccept` no longer leaks the received file into the send queue |
| `seventh fix` | Files tab M2 redesign: unified list, filter chips, no sender progress bar, no `Download` button, FAB anchored to panel |

**Bug-by-bug root causes** (for the record):

1. **98 % stuck on first file / image corruption** — both data channels were
   created with `maxRetransmits: 0` → unreliable mode → silent chunk drops.
   Fixed in `fourth fix`; see ADR-0025.
2. **Second file stuck at `QUEUED`** — `handleFileAccept` added the file to
   *both* `currentFile` and `queue`. Fixed in `second fix`; see ADR-0009.
3. **No `isLast=1` chunk ever observed** — `data[40] === 1` on an
   `ArrayBuffer` is always `false` (the byte-indexed read returns
   `undefined` for `ArrayBuffer`s; you have to go through a `Uint8Array`
   view). Fixed in `fourth fix`; see ADR-0025.
4. **Connection silently lost on files > ~19 MB** — SCTP send buffer
   overflow, data channel closes without an error event. Fixed in `fifth
   fix`; see ADR-0026.
5. **Bidirectional: A→B works, then B→A stuck at `QUEUED`** — `sendFileAccept`
   (the receiver-side path) was assigning the just-received file to
   `queueManager.currentFile`. The receive then ran to `COMPLETED` but never
   released the slot, so the next user-initiated send was pushed behind
   a phantom current. Fixed in `sixth fix`; see ADR-0009.
6. **FAB floating over the Connection panel on mobile** —
   `position: sticky; bottom: 0.5rem;` resolved against `<html>`, not the
   Files panel. Fixed structurally in `seventh fix`; see ADR-0027.

**New / changed artefacts:**

- ADRs: `0025` (FILE_RECEIVED + NACK), `0026` (SCTP backpressure), `0027` (Unified Files Tab)
- ADRs updated: `0009` (queue is SEND-only), `0011` (`terminatedAt`, `getStateGroup()`)
- Context updated: `0001` (Active / Done file, Filter chip, SCTP backpressure, Ack timeout, NACK round)
- Tests: `tests/regression/regression.test.js` grew from ~13 tests to **198** (added ~18.5 kB of regression coverage for the protocol, queue, and UI)
