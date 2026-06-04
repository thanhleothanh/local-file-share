# File Sharing Context

## Purpose

The File Sharing context enables sending files between devices on the same local network without requiring internet access or external servers. Devices discover each other via a WebSocket signaling server and establish direct WebRTC connections for file transfer.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Connection** | A WebRTC peer-to-peer connection established between two devices via WebSocket signaling |
| **Device** | A browser instance connected to the WebSocket signaling server, identified by a descriptive random name and UUID |
| **Device List** | The list of all devices currently connected to the WebSocket signaling server, displayed in the Connection tab |
| **Chunk** | A fixed-size (8KB) piece of file data transmitted over the WebRTC data channel |
| **Queue** | A FIFO (First-In-First-Out) ordered list of files waiting to be sent over a connection. **Send-direction only** (ADR-0009): received files never enter the local send queue. |
| **File Transfer** | The process of sending a file from one device to another, broken into chunks and transmitted over WebRTC |
| **WebSocket Signaling** | The process of discovering devices and exchanging WebRTC signaling information (SDP offers/answers, ICE candidates) via a WebSocket server |
| **Control Channel** | A WebRTC data channel dedicated to JSON signaling messages (file offers, accepts, etc.) |
| **Data Channel** | A WebRTC data channel dedicated to binary file chunk transmission. Reliable + ordered; subject to SCTP backpressure (ADR-0025, ADR-0026). |
| **SCTP backpressure** | The mechanism by which a sender paces chunks so the data channel's send buffer never overflows. The sender awaits `bufferedamountlow` before pushing the next chunk; threshold is 1 MiB. (ADR-0026) |
| **Ack timeout** | The 30-second window the sender waits for the receiver's `FILE_RECEIVED` after sending `TRANSFER_DONE`. If it expires, the file is marked `FAILED` and the queue advances. (ADR-0025) |
| **NACK round** | One pass of "receiver reports missing indices, sender re-sends them from its chunk cache". Bounded at `MAX_NACK_ROUNDS = 3`; after that the file is marked `FAILED`. The sender's chunk cache is managed via per-chunk ACKs (ADR-0030) which delete cached chunks as soon as they are acknowledged by the receiver, with NACK as the fallback retransmit mechanism. (ADR-0025, ADR-0030) |
| **Chunk ACK** | An acknowledgement message sent by the receiver to confirm receipt of specific chunks. ACKs are batched per file and sent every 5 seconds to reduce control message overhead. The sender deletes ACKed chunks from its cache to prevent memory growth. (ADR-0030) |
| **ACK batch** | A collection of chunk indices that have been received but not yet acknowledged. Batched per file and sent every 5 seconds (or immediately on file terminal states). (ADR-0030) |
| **ACK flush** | Immediate sending of all pending ACKs for a file, triggered when the file reaches a terminal state (COMPLETED, FAILED, CANCELLED) or when the connection closes. (ADR-0030) |
| **Files list** | The single scrolling list in the Files tab. Rows are sorted by `createdAt` descending (newest first) and include all states. There are no filter chips. (ADR-0027) |
| **Send button** | The `+` button in the right end of the Files header. Visible only while the connection is `CONNECTED`; opens the OS file picker. (ADR-0027) |
| **Files empty state** | The placeholder shown when the list has zero rows. Two variants: "Tap + to send your first file" when `CONNECTED`, "Connect a device to start sharing files" otherwise. (ADR-0027) |
| **Descriptive Device Name** | A user-friendly random name for each device (e.g., "Happy Fox", "Sleepy Tiger") generated using adjective + animal combination. (ADR-0035) |
| **Connection Request** | A request sent from one device to another via the signaling server to initiate a WebRTC connection. Displayed as a modal dialog on the target device. |
| **Connection Request Timeout** | The 30-second window for a device to accept or reject a connection request. After timeout, the request is treated as failed. (ADR-0038) |
| **Trickle ICE** | The strategy of sending SDP offer immediately and streaming ICE candidates as they are gathered, rather than waiting for all candidates. (ADR-0037) |

## Deprecated Terms

The following terms were part of the previous QR-based connection architecture and are now deprecated:

| Term | Replacement / Note |
|------|-------------------|
| **Connection Secret** | No longer needed; WebRTC built-in verification is sufficient |
| **QR Handshake** | Replaced by WebSocket signaling |
| **Connection step** | Replaced by device list with connection states |
| **Connection role** | Replaced by device list with action buttons |
| **Step pane** | Removed; device list is always visible |
| **Step dot** | Removed; connection status shown per device |
| **Device card** | Now refers to device rows in the device list |
| **Manual step advance** | Replaced by direct Connect/Disconnect actions |
| **Disconnect** | Now available as a button on connected devices |
