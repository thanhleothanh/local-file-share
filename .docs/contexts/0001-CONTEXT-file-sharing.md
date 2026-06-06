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
| **QR input source** | The channel through which a QR code is delivered to the scanner: **camera** (live video via `getUserMedia`) or **image upload** (user-supplied file via file picker). Both sources are available at every scan point. The first source to deliver a valid result wins; the other is ignored. |
| **Image upload scan** | The act of decoding a QR code from a user-supplied image file. The file is processed entirely in the browser via zxing-js/browser; no network round-trip. Failure (no QR found, invalid QR, oversize file, non-image) surfaces as a toast and the scanner pane remains visible. |
| **Camera decline fallback** | The guarantee that if the user denies camera access, the scanner pane stays visible and the **Upload QR image** button remains active — the user can still connect by uploading a screenshot or photo of the QR. (ADR-0031) |
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
| **Connection step** | One of three states in the Connection tab's progress bar: **Offer**, **Answer**, **Connected**. Each step renders different content based on the device's `connectionRole`. |
| **Connection role** | The device's position in the 2-QR handshake: **idle** (no choice yet), **initiator** (chose to create the offer, will scan the answer), or **joiner** (chose to scan the offer, will show the answer). Drawn from the same `connectionRole` JS state in `main.js`. |
| **Step pane** | One of three `div.step-pane` containers in the Connection tab — `step1Pane`, `step2Pane`, `step3Pane`. Only one is visible at a time, switched by `renderStepContent()`. |
| **Step dot** | One of three `div.step-dot` indicators in the dot progress bar. Styling: `active` (accent, current step), `completed` (success, past step), or default (bg-secondary, future step). |
| **Device card** | A row in the step-3 connected view that shows one of the two devices in the connection. The local card has a `you` modifier (accent border + "You" badge); the peer card is a generic placeholder (peer device type is not exchanged over the control channel). |
| **Step 1 idle** | The sub-state of `step1Pane` shown when `connectionRole === 'idle'`: two big choice cards — "Create Offer" and "Scan Offer". |
| **Step 1 initiator** | The sub-state of `step1Pane` shown when `connectionRole === 'initiator'`: the device's offer QR plus a **"Proceed to scan Answer QR from other device"** button. The button is the manual advance trigger to step 2. |
| **Step 1 joiner** | The sub-state of `step1Pane` shown when `connectionRole === 'joiner'`: live camera scanner pointed at the other device's QR. Auto-advances to step 2 on successful scan. |
| **Step 2 initiator** | The sub-state of `step2Pane` shown when `connectionRole === 'initiator'`: a live camera scanner is **always on** while the pane is visible. The scanner is auto-started by `updateUI()` (via `wantAnswerScanner = currentStep === 2 && connectionRole === 'initiator'`) and auto-stopped on transition to step 3 or back to step 1. The user never has to tap a button to open or close the camera. |
| **Step 2 joiner** | The sub-state of `step2Pane` shown when `connectionRole === 'joiner'`: the device's answer QR. |
| **Manual step advance** | The pattern where the user explicitly advances to the next step (e.g., the initiator's "Proceed to scan Answer QR from other device" button), as opposed to auto-advance driven by an event. Used so the joiner has a guaranteed window to scan before the offer QR is replaced. |
| **Disconnect** | Ending a session by reloading the page. The app deliberately has no in-app disconnect action — the step-3 view surfaces a "Reload the page to disconnect" hint. This avoids the user accidentally tearing down a working connection mid-transfer. A peer that reloads (or otherwise drops) triggers a silent `FAILED` transition on the other side: the surviving device's state listener calls `resetToIdle()` immediately and the WebRTC manager does **not** escalate `connectionstatechange`/`iceconnectionstatechange` failures to the user via `errorHandler`, because the other side's UI is the same (a clean reload) and there is nothing the user can do but start a new connection. |
