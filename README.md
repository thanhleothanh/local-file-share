# Local File Share

Peer-to-peer file sharing via WebSocket device discovery and WebRTC connection on local network

---

```
 ┌────────────────────────────────────────────────────────────────────┐
 │              CONNECTION — WebSocket Device Discovery                  │
 └────────────────────────────────────────────────────────────────────┘

 ┌────────────────────────┐                       ┌────────────────────────┐
 │    Device A            │                       │    Device B            │
 ├────────────────────────┤                       ├────────────────────────┤
 │                        │                       │                        │
 │  ┌──────────────────┐  │                       │                        │
 │  │ Device List      │  │                       │  ┌──────────────────┐ │
 │  │ - Happy Fox      │  │                       │  │ Device List      │ │
 │  │ - Sleepy Tiger   │  │                       │  │ - Happy Fox      │ │
 │  │ [Connect]        │  │                       │  │ - Sleepy Tiger   │ │
 │  └────────┬─────────┘  │                       │  │ [You]            │ │
 │           │            │                       │  └──────────────────┘ │
 │           │ Connect Request                    │           │           │
 │           │ (via WebSocket signaling server)   │           │           │
 │           └─────────────────────────────────────►           │           │
 │                        │                       │           │           │
 │                        │                       │  ┌──────────────────┐ │
 │                        │                       │  │ Connection       │ │
 │                        │                       │  │ Request Modal    │ │
 │                        │                       │  │                  │ │
 │                        │                       │  │ "Happy Fox wants │ │
 │                        │                       │  │ to connect to    │ │
 │                        │                       │  │ you"             │ │
 │                        │                       │  │ [Accept][Reject] │ │
 │                        │                       │  └────────┬─────────┘ │
 │  ┌──────────────────┐  │                       │           │           │
 │  │ WebRTC Handshake │◄─────────────────────────┘           │           │
 │  │ (offer/answer/   │  │                               │           │
 │  │ ICE candidates) │  │                               │           │
 │  └────────┬─────────┘  │                       │           ▼           │
 │           │            │                       │  ┌──────────────────┐ │
 │           ▼            │                       │  │ Device List      │ │
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
 └────────────────────────────┘                       └────────────────────────┘
```

## Getting Started

### Prerequisites

- Docker (recommended) or Node.js 18+

### Running with Docker (Recommended)

```bash
# Build and run the application
docker build -t local-file-share .
docker run -p 3000:3000 local-file-share

# Access the application at http://localhost:3000
```

### Running Locally

```bash
# Install dependencies
npm install

# Start development server (Vite + Express)
npm run dev

# Access the application at http://localhost:3000
# (Vite serves on 3000, Express WebSocket on 3001, proxied)

# Or for production
npm run build
npm start
```

## Connecting Devices

1. **Start the server** on one machine using Docker or `npm run dev`
2. **Open the app** on two devices on the same WiFi/LAN network (both pointing to the server URL)
3. **View device list** - All connected devices appear in the Connection panel
4. **Initiate connection** - Click "Connect" on another device in the list
5. **Accept connection** - The other device sees a modal dialog to accept or reject
6. **Connected!** - Once accepted, WebRTC establishes a direct peer-to-peer connection

## Sending Files

1. Ensure you are in the **Connected** state (device shows "Connected" with disconnect button)
2. In the **Files** panel, click the **"+" button** (top-right of the Files header)
3. Select one or more files (max 500 MB each)
4. The peer will be prompted to accept or reject
5. Wait for the transfer to complete

## Receiving Files

1. When a peer sends a file, it appears in the **Files** panel as **"Offered by [device name]"**
2. Click **"Accept"** to start receiving, or **"Reject"** to decline
3. When the transfer completes, the browser's **save dialog** opens automatically — choose where to save

## Architecture

- **WebSocket Signaling Server** (Express + `ws`): Device discovery and WebRTC signaling relay
- **WebRTC**: Direct peer-to-peer connection for file transfer
- **Device Identification**: Auto-generated descriptive names (e.g., "Happy Fox") + UUID
- **File Transfer**: Chunked transfer (8KB chunks) with ACK/NACK for reliability
- **Data Channels**: Separate control channel (JSON messages) and data channel (binary chunks)
- **Backpressure**: SCTP-based flow control to prevent buffer overflow

Detailed design decisions and architecture are documented in `.docs/`.
