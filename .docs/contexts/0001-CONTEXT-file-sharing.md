# File Sharing Context

## Purpose

The File Sharing context enables sending files between devices on the same local network. One device runs a Node.js signaling server; other devices connect via browser. WebRTC provides the peer-to-peer file transfer channel.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Connection** | A WebRTC peer-to-peer connection established between two devices via the WebSocket signaling handshake |
| **Chunk** | A fixed-size (16KB) piece of file data transmitted over the WebRTC data channel |
| **Queue** | A FIFO ordered list of files waiting to be sent over a connection. **Send-direction only**: received files never enter the local send queue. |
| **File Transfer** | The process of sending a file from one device to another, streamed in chunks over WebRTC |
| **Signaling Server** | A Node.js + `ws` process that relays WebRTC signaling messages (SDP offers/answers, ICE candidates) between devices on the network |
| **Control Channel** | A WebRTC data channel dedicated to JSON signaling messages (file offers, accepts, etc.) |
| **Data Channel** | A WebRTC data channel dedicated to binary file chunk transmission. Reliable + ordered; subject to SCTP backpressure. |
| **SCTP Backpressure** | The mechanism by which a sender paces chunks so the data channel's send buffer never overflows. The sender awaits `bufferedamountlow` (1 MiB threshold) before pushing the next chunk. |
| **Ack Timeout** | The 30-second window the sender waits for the receiver's `FILE_RECEIVED` after sending `TRANSFER_DONE`. If it expires, the file is marked `FAILED` and the queue advances. |
| **NACK Round** | One pass of "receiver reports missing indices, sender re-sends them from `sentChunkCache`". Bounded at `MAX_NACK_ROUNDS = 3`; after that the file is marked `FAILED`. |
| **Batch Offer** | When the sender picks multiple files, all are offered to the receiver at once. The receiver accepts/rejects each individually before any transfer begins. |
| **Receiver-Driven Order** | The receiver chooses which file to accept next from the batch offer. Accept buttons are disabled while a transfer is in progress. |
| **File System Access API** | A browser API (`showSaveFilePicker`) that allows streaming files directly to disk. Used as primary storage on Chromium browsers. No file size limit. |
| **IndexedDB Fallback** | Browser storage mechanism used on Safari/iOS where File System Access API is not available. Chunks buffered in IndexedDB, assembled into Blob on completion. 1GB queue limit. |
| **Streaming** | The process of sending file data chunk-by-chunk from sender to receiver without buffering the entire file in memory. Sender reads from disk, receiver writes to disk in real-time. |
| **Device List** | The list of all connected devices shown in the Connection tab. Updated in real-time by the signaling server. |
| **Device Name** | Auto-generated name from user agent (e.g., "Mobile #1", "Desktop #2"). Editable by the user, stored in localStorage. |
| **Connection State** | The 3-state model: IDLE (no connection), CONNECTING (waiting for accept/reject), CONNECTED (WebRTC active). |
| **File State** | The 7-state model: PENDING, QUEUED, TRANSFERRING, COMPLETED, REJECTED, FAILED, CANCELLED. |
| **Idle Timer** | 10-minute timer that fires when no control/data channel messages are received. Transitions connection to IDLE. |
| **Toast Notification** | A temporary message (success, error, info, warning) shown at the top of the screen. Auto-dismisses after 2 seconds. |

## Key Relationships

- **Signaling Server ↔ Devices**: WebSocket connection for signaling. Server maintains device list and tracks which devices are connected to each other.
- **Device ↔ Device**: WebRTC peer connection (1:1 only). Two data channels: control (JSON) and data (binary chunks).
- **File System Access API ↔ IndexedDB**: Mutually exclusive storage backends. Detected at runtime. FSA streams to disk (no limit), IndexedDB buffers in browser (1GB limit).
- **Queue ↔ File State Machine**: Queue manages send-order. File state machine tracks individual file lifecycle. Only send-direction files enter the queue.
