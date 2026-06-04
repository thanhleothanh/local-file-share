# Issue 0006 — WebRTC Peer Connection + Data Channel Roundtrip

## Parent

Derived from `.docs/prds/0005-webrtc-peer-connection.md`.

## What to build

Establish a WebRTC peer connection between two devices and verify the two data channels (`control`, `data`) are open. The `WebRTCConnection` owns the `RTCPeerConnection` lifecycle, the `IceExchange` translates SDP/ICE between WebRTC and the signaling server, and the `DataChannelFactory` creates both channels. Slice ends with a "ping" message roundtrip: when the connection becomes CONNECTED, the offerer sends `"hello"` over the data channel; the answerer logs it to the console. This proves the transport works before any file transfer logic is added.

## Acceptance criteria

- [ ] `WebRTCConnection.connect(targetDeviceId)` creates an `RTCPeerConnection`, calls `createOffer`, sends the SDP offer via the signaling channel
- [ ] `WebRTCConnection.accept(targetDeviceId)` waits for an offer, creates an answer, sends it back
- [ ] `IceExchange` forwards ICE candidates via the signaling channel; buffers candidates that arrive before `setRemoteDescription` resolves
- [ ] `DataChannelFactory.createDataChannel(peer)` returns an `RTCDataChannel` with `bufferedAmountLowThreshold = 1 MiB`; both channels are created with reliable + ordered (no `maxRetransmits`)
- [ ] On `datachannel` open for both sides, `WebRTCConnection` emits `data-channel-open` with both channels
- [ ] After CONNECTED, the offerer sends `"hello"` over the `data` channel; the answerer logs it to the console within 100 ms
- [ ] Calling `WebRTCConnection.close()` is idempotent; it sends a `CLOSE` message on the control channel (best-effort) and closes the peer connection
- [ ] `ConnectionStateMachine` transitions: CONNECTED → IDLE on close
- [ ] E2E test: open two contexts; A connects to B; B accepts; A sends "hello"; B's console shows "received: hello" within 100 ms; A clicks Disconnect; both return to IDLE
- [ ] Unit test: `DataChannelFactory.createDataChannel(peer)` returns a channel with `bufferedAmountLowThreshold = 1048576`
- [ ] Unit test: `WebRTCConnection.close()` called twice does not throw the second time
- [ ] All previously passing tests still pass

## Blocked by

- 0005 (Connect/accept/reject flow must work to trigger connection establishment)

## User stories covered

- PRD-0005 stories 1-2, 4-6, 9-10
