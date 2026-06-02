# Local File Share

Peer-to-peer file sharing via QR code connection through LAN network

---

```
 ┌────────────────────────────────────────────────────────────────────┐
 │                 CONNECTION — 2-QR Handshake                       │
 └────────────────────────────────────────────────────────────────────┘

 ┌────────────────────────┐                       ┌────────────────────────┐
 │   Device A (Initiator) │                       │   Device B (Joiner)    │
 ├────────────────────────┤                       ├────────────────────────┤
 │                        │                       │                        │
 │  ┌──────────────────┐  │                       │                        │
 │  │ 1. "Create Offer" │  │                       │                        │
 │  │ 2.  Show Offer QR │  │                       │  ┌──────────────────┐ │
 │  └────────┬─────────┘  │                       │  │ 3. "Scan Offer"   │ │
 │           │            │                       │  └────────┬─────────┘ │
 │           │   Offer QR  (SDP + secret)          │           │           │
 │           └─────────────────────────────────────►           │           │
 │                        │                       │           │           │
 │                        │                       │  ┌────────▼─────────┐ │
 │                        │                       │  │ 4. Show Answer QR│ │
 │                        │                       │  └────────┬─────────┘ │
 │  ┌──────────────────┐  │                       │           │           │
 │  │ 5. Scan Answer QR │◄─────────────────────────┘           │           │
 │  └────────┬─────────┘  │    Answer QR (SDP + secret)        │           │
 │           │            │                       │                        │
 │           ▼            │                       │           ▼            │
 │  ┌─────────────────────────────┐   ┌─────────────────────────────┐     │
 │  │      ✅ CONNECTED           │   │      ✅ CONNECTED           │     │
 │  │  WebRTC Data Channels Open  │   │  WebRTC Data Channels Open  │     │
 │  └─────────────────────────────┘   └─────────────────────────────┘     │
 └────────────────────────┘                       └────────────────────────┘


 ┌────────────────────────────────────────────────────────────────────┐
 │                      FILE TRANSFER                                │
 └────────────────────────────────────────────────────────────────────┘

 ┌────────────────────────┐                       ┌────────────────────────┐
 │   Device A (Sender)    │                       │   Device B (Receiver)  │
 ├────────────────────────┤                       ├────────────────────────┤
 │                        │                       │                        │
 │  ┌──────────────────┐  │                       │                        │
 │  │ Click "+"        │  │                       │                        │
 │  │ Select file(s)   │  │                       │                        │
 │  └────────┬─────────┘  │                       │                        │
 │           │            │                       │                        │
 │           │  ┌──────────────────────────┐      │                        │
 │           │  │ FILE_OFFER  (control ch) │─────►│                        │
 │           │  └──────────────────────────┘      │                        │
 │           │            │                       │  ┌──────────────────┐ │
 │           │            │                       │  │  "Accept"       │ │
 │           │            │                       │  └────────┬─────────┘ │
 │           │  ┌──────────────────────────┐      │           │           │
 │           │  │ FILE_ACCEPT (control ch) │◄─────┘           │           │
 │           │  └──────────────────────────┘      │           │           │
 │           │            │                       │           ▼           │
 │           │  ┌──────────────────────────────────────────────────────┐ │
 │           │  │  ┌──────┐  ┌──────┐  ┌──────┐          ┌──────┐   │ │
 │           │  │  │chunk │  │chunk │  │chunk │  ......  │chunk │   │ │
 │           │  │  │  0   │  │  1   │  │  2   │          │  N   │   │ │
 │           │  │  │ 8KB  │  │ 8KB  │  │ 8KB  │          │ 8KB  │   │ │
 │           │  │  └──┬───┘  └──┬───┘  └──┬───┘          └──┬───┘   │ │
 │           │  │     │         │         │     ......      │      │ │
 │           │  │     └─────────┴─────────┴─────────────────┘      │ │
 │           │  │           data channel (binary)                  │ │
 │           │  └──────────────────────────────────────────────────┘ │
 │           │            │                       │           │           │
 │           │  ┌──────────────────────────┐      │                       │
 │           │  │ TRANSFER_DONE (control)  │─────►│                       │
 │           │  └──────────────────────────┘      │                       │
 │           │            │                       │                       │
 │           │            │     ┌──────────────────────────┐              │
 │           │            │     │ Detect missing chunks    │              │
 │           │            │     │ ┌──────────────────────┐ │              │
 │           │            │     │ │ CHUNK_REQUEST_NACK  │ │              │
 │           │  ◄─────────┼─────┼─┤ (control ch)        │ │              │
 │           │            │     │ └──────────────────────┘ │              │
 │           │            │     └──────┬───────────────────┘              │
 │           │  ┌──────────────────────────┐      │           │           │
 │           │  │ Re-send missing chunks   ├─────►│           │           │
 │           │  └──────────────────────────┘      │           │           │
 │           │            │                       │  ┌──────────────────┐ │
 │           │  ┌──────────────────────────┐      │  │ File assembled   │ │
 │           │  │ FILE_RECEIVED (control)  │◄─────┤  │ Save dialog      │ │
 │           │  └──────────────────────────┘      │  └──────────────────┘ │
 │                        │                       │                        │
 └────────────────────────┘                       └────────────────────────┘
```

## Getting Started

1. Open the app on **two devices** on the same WiFi/LAN network.
2. The app has two panels: **Connection** and **Files**.

## Connecting

### Device A (Initiator)

1. In the **Connection** panel, click **"Create Offer"**.
2. A QR code appears. Click **"Proceed to scan Answer QR from other device"** to advance.
3. When the camera opens, scan the Answer QR shown on Device B.

### Device B (Joiner)

1. In the **Connection** panel, click **"Scan Offer"**.
2. Point the camera at Device A's Offer QR.
3. An Answer QR appears on your screen — keep it visible for Device A to scan.

### Connected

- Both devices show a "Connected" view with a heartbeat animation on step 3.

## Sending Files

1. Ensure you are in the **Connected** state.
2. In the **Files** panel, click the **"+" button** (top-right of the Files header).
3. Select one or more files (max 500 MB each).
4. The peer will be prompted to accept or reject. Wait for the transfer to complete.

## Receiving Files

1. When a peer sends a file, it appears in the **Files** panel as **"Offered by peer"**.
2. Click **"Accept"** to start receiving, or **"Reject"** to decline.
3. When the transfer completes, the browser's **save dialog** opens automatically — choose where to save.

---

Detailed design decisions and architecture are documented in `.docs/`.
