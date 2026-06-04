import type { DeviceDescriptor, AnySignalingMessage } from '@lfs/shared';
import { ConnectionState, ConnectionStateMachine } from '@lfs/shared';
import type { WebSocketClient } from '../signaling/WebSocketClient.js';
import { WebRTCConnection, type WebRTCConnectionOptions } from '../webrtc/WebRTCConnection.js';

export interface ConnectionViewModelState {
  devices: readonly DeviceDescriptor[];
  serverConnected: boolean;
  connectionState: ConnectionState;
  connectedDeviceId: string | null;
  connectingToDeviceId: string | null;
  incomingRequest: { fromDeviceId: string; fromDeviceName: string } | null;
  localDeviceId: string;
  localDeviceName: string;
  dataChannelOpen: boolean;
}

export interface ConnectionViewModelOptions {
  client: WebSocketClient;
  localDeviceId: string;
  localDeviceName: string;
}

export type ConnectionViewModelListener = (state: ConnectionViewModelState) => void;

export class ConnectionViewModel {
  private readonly client: WebSocketClient;
  private readonly sm: ConnectionStateMachine = new ConnectionStateMachine();
  private state: ConnectionViewModelState;
  private readonly listeners = new Set<ConnectionViewModelListener>();
  private readonly unsubscribers: Array<() => void> = [];
  private webrtc: WebRTCConnection | null = null;

  constructor(options: ConnectionViewModelOptions) {
    this.client = options.client;
    this.state = {
      devices: [],
      serverConnected: false,
      connectionState: ConnectionState.IDLE,
      connectedDeviceId: null,
      connectingToDeviceId: null,
      incomingRequest: null,
      localDeviceId: options.localDeviceId,
      localDeviceName: options.localDeviceName,
      dataChannelOpen: false,
    };
  }

  getState(): ConnectionViewModelState {
    return this.state;
  }

  getStateMachine(): ConnectionStateMachine {
    return this.sm;
  }

  subscribe(listener: ConnectionViewModelListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  attach(): void {
    this.unsubscribers.push(
      this.sm.onTransition((detail) => {
        this.update((prev) => ({ ...prev, connectionState: detail.to }));
      }),
      this.client.on('device-list-updated', (devices) => {
        const list = devices as readonly DeviceDescriptor[];
        this.update((prev) => {
          const stillConnected =
            prev.connectedDeviceId !== null && list.some((d) => d.deviceId === prev.connectedDeviceId);
          const next: ConnectionViewModelState = { ...prev, devices: list };
          if (!stillConnected && prev.connectionState === ConnectionState.CONNECTED) {
            next.connectionState = ConnectionState.IDLE;
            next.connectedDeviceId = null;
            try {
              this.sm.reset(ConnectionState.IDLE);
            } catch {
              /* ignore */
            }
          }
          return next;
        });
      }),
      this.client.on('registered', () => {
        this.update((prev) => ({ ...prev, serverConnected: true }));
      }),
      this.client.on('close', () => {
        this.update((prev) => ({
          ...prev,
          serverConnected: false,
          connectionState: ConnectionState.IDLE,
          connectedDeviceId: null,
          connectingToDeviceId: null,
          incomingRequest: null,
          dataChannelOpen: false,
        }));
        this.cleanupWebRTC();
        try {
          this.sm.reset(ConnectionState.IDLE);
        } catch {
          /* ignore */
        }
      }),
      this.client.on('incoming-connect-request', (msg) => {
        const m = msg as { from: string; data?: { requesterName?: string } };
        this.update((prev) => ({
          ...prev,
          incomingRequest: { fromDeviceId: m.from, fromDeviceName: m.data?.requesterName ?? 'Unknown' },
        }));
      }),
      this.client.on('connect-accepted', (msg) => {
        const m = msg as { from: string };
        try {
          this.sm.dispatch('CONNECT_ACCEPTED');
        } catch {
          /* ignore */
        }
        // On connect-accepted, initialize WebRTC as answerer
        this.initiateWebRTC(m.from, false);
        this.update((prev) => ({
          ...prev,
          connectedDeviceId: m.from,
          connectingToDeviceId: null,
        }));
      }),
      this.client.on('connect-rejected', () => {
        try {
          this.sm.dispatch('CONNECT_REJECTED');
        } catch {
          /* ignore */
        }
        this.cleanupWebRTC();
        this.update((prev) => ({
          ...prev,
          connectingToDeviceId: null,
        }));
      }),
      this.client.on('peer-disconnected', () => {
        try {
          this.sm.dispatch('DISCONNECT');
        } catch {
          /* ignore */
        }
        this.cleanupWebRTC();
        this.update((prev) => ({
          ...prev,
          connectionState: ConnectionState.IDLE,
          connectedDeviceId: null,
        }));
      }),
      this.client.on('incoming-offer', (msg) => {
        const message = msg as AnySignalingMessage;
        const sdpData = message.data as { sdp?: string; type?: 'offer' | 'answer' } | undefined;
        if (this.webrtc && sdpData?.sdp) {
          this.webrtc.handleOffer({ sdp: sdpData.sdp, type: 'offer' } as RTCSessionDescriptionInit);
        }
      }),
      this.client.on('incoming-answer', (msg) => {
        const message = msg as AnySignalingMessage;
        const sdpData = message.data as { sdp?: string; type?: 'offer' | 'answer' } | undefined;
        if (this.webrtc && sdpData?.sdp) {
          this.webrtc.handleAnswer({ sdp: sdpData.sdp, type: 'answer' } as RTCSessionDescriptionInit);
        }
      }),
      this.client.on('incoming-ice-candidate', (msg) => {
        const message = msg as AnySignalingMessage;
        if (this.webrtc) {
          this.webrtc.handleIceCandidate(message);
        }
      }),
    );
  }

  detach(): void {
    this.cleanupWebRTC();
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  isSelf(device: DeviceDescriptor): boolean {
    return device.deviceId === this.state.localDeviceId;
  }

  requestConnect(targetDeviceId: string): boolean {
    if (this.state.connectionState !== ConnectionState.IDLE) return false;
    const target = this.state.devices.find((d) => d.deviceId === targetDeviceId);
    if (target === undefined) return false;
    const sent = this.client.send({
      type: 'connect-request',
      from: this.state.localDeviceId,
      to: targetDeviceId,
      data: { targetDeviceId, requesterName: this.state.localDeviceName },
      timestamp: Date.now(),
    });
    if (!sent) return false;
    try {
      this.sm.dispatch('REQUEST_CONNECT');
    } catch {
      return false;
    }
    // Initialize WebRTC as offerer when request is sent
    this.initiateWebRTC(targetDeviceId, true);
    this.update((prev) => ({
      ...prev,
      connectingToDeviceId: targetDeviceId,
      connectionState: ConnectionState.CONNECTING,
    }));
    return true;
  }

  acceptIncoming(): boolean {
    const req = this.state.incomingRequest;
    if (req === null) return false;
    const sent = this.client.send({
      type: 'accept-connect',
      from: this.state.localDeviceId,
      to: req.fromDeviceId,
      data: { requesterDeviceId: req.fromDeviceId },
      timestamp: Date.now(),
    });
    if (!sent) return false;
    this.update((prev) => ({
      ...prev,
      incomingRequest: null,
      connectionState: ConnectionState.CONNECTED,
      connectedDeviceId: req.fromDeviceId,
    }));
    return true;
  }

  rejectIncoming(reason?: string): boolean {
    const req = this.state.incomingRequest;
    if (req === null) return false;
    const sent = this.client.send({
      type: 'reject-connect',
      from: this.state.localDeviceId,
      to: req.fromDeviceId,
      data: { requesterDeviceId: req.fromDeviceId, reason: reason ?? 'rejected' },
      timestamp: Date.now(),
    });
    if (!sent) return false;
    this.update((prev) => ({ ...prev, incomingRequest: null }));
    return true;
  }

  cancelOutgoing(): boolean {
    if (this.state.connectionState !== ConnectionState.CONNECTING) return false;
    const target = this.state.connectingToDeviceId;
    if (target === null) return false;
    this.client.send({
      type: 'disconnect',
      from: this.state.localDeviceId,
      to: target,
      data: { targetDeviceId: target, reason: 'cancelled' },
      timestamp: Date.now(),
    });
    try {
      this.sm.dispatch('PEER_CANCELLED');
    } catch {
      /* ignore */
    }
    this.update((prev) => ({
      ...prev,
      connectionState: ConnectionState.IDLE,
      connectingToDeviceId: null,
    }));
    return true;
  }

  disconnect(): boolean {
    if (this.state.connectionState !== ConnectionState.CONNECTED) return false;
    const target = this.state.connectedDeviceId;
    if (target === null) return false;

    // Close WebRTC connection
    this.cleanupWebRTC();

    this.client.send({
      type: 'disconnect',
      from: this.state.localDeviceId,
      to: target,
      data: { targetDeviceId: target, reason: 'user' },
      timestamp: Date.now(),
    });
    try {
      this.sm.dispatch('DISCONNECT');
    } catch {
      /* ignore */
    }
    this.update((prev) => ({
      ...prev,
      connectionState: ConnectionState.IDLE,
      connectedDeviceId: null,
      dataChannelOpen: false,
    }));
    return true;
  }

  /**
   * Initialize WebRTC connection.
   * @param targetDeviceId - The device ID to connect to
   * @param isOfferer - Whether this side is the offerer
   */
  private initiateWebRTC(targetDeviceId: string, isOfferer: boolean): void {
    // Skip WebRTC initialization if the API is not available (e.g., in test environments)
    if (typeof RTCPeerConnection === 'undefined') {
      this.loggerFor('WebRTC').info('RTCPeerConnection not available, skipping WebRTC initialization');
      return;
    }

    this.cleanupWebRTC();

    const options: WebRTCConnectionOptions = {
      signalingClient: this.client,
      localDeviceId: this.state.localDeviceId,
      targetDeviceId,
      isOfferer,
    };

    this.webrtc = new WebRTCConnection(options);

    // Set up WebRTC event listeners
    this.unsubscribers.push(
      this.webrtc.on('data-channel-open', () => {
        this.loggerFor('WebRTC').info('data channels open');
        this.update((prev) => ({ ...prev, dataChannelOpen: true }));
      }),
      this.webrtc.on('data-channel-close', () => {
        this.loggerFor('WebRTC').info('data channels closed');
        this.update((prev) => ({ ...prev, dataChannelOpen: false }));
      }),
      this.webrtc.on('data-channel-message', (payload: { channel: 'control' | 'data'; data: string | ArrayBuffer }) => {
        if (payload.channel === 'data' && typeof payload.data === 'string' && payload.data === 'hello') {
          this.loggerFor('WebRTC').info('received hello message on data channel');
          // Log to console as required by the issue
          console.info('[WebRTC] received: hello');
        }
      }),
    );

    // Start WebRTC connection
    if (isOfferer) {
      void this.webrtc.connect();
    } else {
      void this.webrtc.accept();
    }
  }

  /**
   * Clean up WebRTC connection.
   */
  private cleanupWebRTC(): void {
    if (this.webrtc) {
      this.webrtc.close();
      this.webrtc = null;
    }
  }

  /**
   * Helper to create a logger with the given prefix.
   */
  private loggerFor(prefix: string): { info: (msg: string, ctx?: unknown) => void } {
    return {
      info: (msg: string, ctx?: unknown) => {
        console.info(`[${prefix}] ${msg}`, ctx);
      },
    };
  }

  private update(updater: (prev: ConnectionViewModelState) => ConnectionViewModelState): void {
    this.state = updater(this.state);
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* swallow */
      }
    }
  }
}
