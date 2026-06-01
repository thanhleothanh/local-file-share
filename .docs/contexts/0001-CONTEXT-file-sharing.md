# File Sharing Context

## Purpose

The File Sharing context enables sending files between devices on the same local network without requiring internet access or external servers.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Connection** | A WebRTC peer-to-peer connection established between two devices via the 2-QR handshake process |
| **Connection Secret** | A randomly generated string included in QR codes to authenticate the connection between two devices |
| **Chunk** | A fixed-size (8KB) piece of file data transmitted over the WebRTC data channel |
| **Queue** | A FIFO (First-In-First-Out) ordered list of files waiting to be sent over a connection. **Send-direction only** (ADR-0009): received files never enter the local send queue. |
| **File Transfer** | The process of sending a file from one device to another, broken into chunks and transmitted over WebRTC |
| **QR Handshake** | The two-QR code (ping-pong) process used to establish a WebRTC connection between two devices |
| **Control Channel** | A WebRTC data channel dedicated to JSON signaling messages (file offers, accepts, etc.) |
| **Data Channel** | A WebRTC data channel dedicated to binary file chunk transmission. Reliable + ordered; subject to SCTP backpressure (ADR-0025, ADR-0026). |
| **Active file** | A file in `PENDING`, `QUEUED`, or `TRANSFERRING` state. Appears under the **Active** filter chip. |
| **Done file** | A file in a terminal state — `COMPLETED`, `FAILED`, `REJECTED`, or `CANCELLED`. Appears under the **Done** filter chip. |
| **Filter chip** | One of three buttons above the Files list: **All**, **Active**, **Done**. Each shows a live count. (ADR-0027) |
| **SCTP backpressure** | The mechanism by which a sender paces chunks so the data channel's send buffer never overflows. The sender awaits `bufferedamountlow` before pushing the next chunk; threshold is 1 MiB. (ADR-0026) |
| **Ack timeout** | The 30-second window the sender waits for the receiver's `FILE_RECEIVED` after sending `TRANSFER_DONE`. If it expires, the file is marked `FAILED` and the queue advances. (ADR-0025) |
| **NACK round** | One pass of "receiver reports missing indices, sender re-sends them from `sentChunkCache`". Bounded at `MAX_NACK_ROUNDS = 3`; after that the file is marked `FAILED`. (ADR-0025) |
| **Last-event time** | The timestamp `getLastEventTime()` returns for sorting the All / Done chips: `completedAt` for `COMPLETED` files, `terminatedAt` for `FAILED` / `REJECTED` / `CANCELLED`, otherwise `createdAt`. (ADR-0011) |
