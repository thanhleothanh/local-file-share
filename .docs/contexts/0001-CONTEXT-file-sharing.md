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
