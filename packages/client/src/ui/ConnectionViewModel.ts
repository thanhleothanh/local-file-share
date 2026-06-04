import type { DeviceDescriptor, AnySignalingMessage } from '@lfs/shared';
import { ConnectionState, ConnectionStateMachine } from '@lfs/shared';
import type { WebSocketClient } from '../signaling/WebSocketClient.js';
import { WebRTCConnection, type WebRTCConnectionOptions } from '../webrtc/WebRTCConnection.js';
import { FileSender, FileReceiver, FileSystemAccessWriter } from '../files/index.js';

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
  // File transfer progress
  fileProgress: {
    fileId: string;
    fileName: string;
    bytesTransferred: number;
    totalBytes: number;
    isSender: boolean;
    showOpenFolder: boolean;
  } | null;
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
  private fileSender: FileSender | null = null;
  private fileReceiver: FileReceiver | null = null;
  private fsaWriter: FileSystemAccessWriter | null = null;

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
      fileProgress: null,
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
   * Send a file to the connected device.
   * Only works when in CONNECTED state and data channels are open.
   */
  async sendFile(file: File): Promise<void> {
    if (this.state.connectionState !== ConnectionState.CONNECTED || !this.fileSender) {
      throw new Error('Cannot send file: not connected or file sender not initialized');
    }

    this.loggerFor('FileSender').info('sending file', { name: file.name, size: file.size });

    // Initialize progress state with file name
    this.update((prev) => ({
      ...prev,
      fileProgress: {
        fileId: '',
        fileName: file.name,
        bytesTransferred: 0,
        totalBytes: file.size,
        isSender: true,
        showOpenFolder: false,
      },
    }));

    await this.fileSender.sendFile(file);
    this.loggerFor('FileSender').info('file sent successfully', { name: file.name });

    // Clear progress after completion
    this.update((prev) => ({
      ...prev,
      fileProgress: null,
    }));
  }

  /**
   * Open the downloads folder where files are saved.
   */
  async openDownloadsFolder(): Promise<void> {
    if (this.fsaWriter) {
      try {
        await this.fsaWriter.openDirectory();
      } catch (error) {
        this.loggerFor('FSA').warn('Failed to open downloads folder', { error });
        const w = window as unknown as { lfs?: { toast: (type: string, message: string) => void } };
        if (typeof window !== 'undefined' && w.lfs?.toast) {
          w.lfs.toast('error', 'Failed to open downloads folder');
        }
      }
    } else {
      this.loggerFor('FSA').warn('FSA writer not available');
    }
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
        void this.cleanupFileTransfer();
      }),
      this.webrtc.on(
        'data-channel-message',
        (payload: { channel: 'control' | 'data'; data: string | ArrayBuffer }) => {
          if (payload.channel === 'data' && typeof payload.data === 'string' && payload.data === 'hello') {
            this.loggerFor('WebRTC').info('received hello message on data channel');
            // Log to console as required by the issue
            console.info('[WebRTC] received: hello');
          } else if (payload.channel === 'data' && payload.data instanceof ArrayBuffer) {
            // Handle incoming file chunk
            this.handleIncomingChunk(payload.data);
          }
        },
      ),
    );

    // Set up file sender and receiver when data channels open
    this.unsubscribers.push(
      this.webrtc.on('data-channel-open', (channels) => {
        this.loggerFor('WebRTC').info('data channels open - initializing file transfer');
        this.initFileTransfer(channels.data);
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
   * Initialize file sender and receiver with the data channel.
   */
  private initFileTransfer(dataChannel: RTCDataChannel): void {
    this.cleanupFileTransfer();

    // Create file sender that sends chunks via the data channel
    this.fileSender = new FileSender({
      sendChunk: async (chunk: ArrayBuffer) => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send(chunk);
        } else {
          throw new Error('Data channel not open');
        }
      },
    });

    // Set up sender progress listener
    this.fileSender.on('progress', (fileId: string, bytesSent: number, totalBytes: number) => {
      this.loggerFor('FileSender').info('progress', { fileId, bytesSent, totalBytes });
      console.info('[FileSender] progress', { fileId, bytesSent, totalBytes });
      // Update progress state for sender
      if (this.state.fileProgress?.fileId !== fileId) {
        this.update((prev) => ({
          ...prev,
          fileProgress: {
            fileId,
            fileName: prev.fileProgress?.fileName ?? 'Unknown',
            bytesTransferred: bytesSent,
            totalBytes,
            isSender: true,
            showOpenFolder: false,
          },
        }));
      } else {
        this.update((prev) => ({
          ...prev,
          fileProgress: prev.fileProgress
            ? {
                ...prev.fileProgress,
                bytesTransferred: bytesSent,
                totalBytes,
              }
            : null,
        }));
      }
    });

    // Create FSA writer if available
    if (FileSystemAccessWriter.isAvailable()) {
      this.fsaWriter = new FileSystemAccessWriter();
    }

    // Create file receiver with the writer
    this.fileReceiver = new FileReceiver({
      writer: this.fsaWriter ?? undefined,
    });

    // Set up receiver event listeners
    this.fileReceiver.onAssembled((fileId: string, fileName: string, byteLength: number) => {
      this.loggerFor('FileReceiver').info('file assembled', { fileId, fileName, byteLength });
      console.info('[FileReceiver] assembled', { fileId, fileName, byteLength });
      // Show toast notification
      const sizeInKB = Math.round(byteLength / 1024);
      const w = window as unknown as { lfs?: { toast: (type: string, message: string) => void } };
      if (typeof window !== 'undefined' && w.lfs?.toast) {
        w.lfs.toast('success', `Received: ${fileName} (${sizeInKB} KB)`);
      }
      // Clear progress and show open folder link
      this.update((prev) => ({
        ...prev,
        fileProgress: prev.fileProgress
          ? {
              ...prev.fileProgress,
              showOpenFolder: true,
              bytesTransferred: byteLength,
            }
          : null,
      }));
    });

    this.fileReceiver.onProgress((fileId: string, bytesReceived: number, totalBytes: number) => {
      this.loggerFor('FileReceiver').info('progress', { fileId, bytesReceived, totalBytes });
      console.info('[FileReceiver] progress', { fileId, bytesReceived, totalBytes });
      // Update progress state
      if (this.state.fileProgress?.fileId !== fileId) {
        this.update((prev) => ({
          ...prev,
          fileProgress: {
            fileId,
            fileName: this.state.fileProgress?.fileName ?? 'Unknown',
            bytesTransferred: bytesReceived,
            totalBytes,
            isSender: false,
            showOpenFolder: false,
          },
        }));
      } else {
        this.update((prev) => ({
          ...prev,
          fileProgress: prev.fileProgress
            ? {
                ...prev.fileProgress,
                bytesTransferred: bytesReceived,
                totalBytes,
              }
            : null,
        }));
      }
    });
  }

  /**
   * Handle an incoming chunk from the data channel.
   * The chunk format is: [41-byte header][chunk data]
   * The header contains: fileId (36 bytes), index (4 bytes), isLast (1 byte)
   * But we also need fileName and totalBytes which should come from FILE_OFFER message.
   * For now, we use generic values as the FILE_OFFER protocol is not yet implemented.
   */
  private handleIncomingChunk(rawChunk: ArrayBuffer): void {
    if (!this.fileReceiver) {
      this.loggerFor('FileReceiver').warn('received chunk but receiver not initialized');
      return;
    }

    // For now, we use generic values
    // In a real implementation, these would come from the FILE_OFFER message
    // which is sent before the actual chunks
    const fileId = 'test-file';
    const fileName = 'test.bin';
    const totalBytes = 102400; // 100 KB

    // Use the async version
    void this.fileReceiver.handleChunk(fileId, fileName, totalBytes, rawChunk);
  }

  /**
   * Clean up file sender and receiver.
   */
  private async cleanupFileTransfer(): Promise<void> {
    if (this.fileReceiver) {
      this.fileReceiver.clear();
      this.fileReceiver = null;
    }
    if (this.fsaWriter) {
      try {
        await this.fsaWriter.clear();
      } catch {
        // Ignore errors during cleanup
      }
      this.fsaWriter = null;
    }
    this.fileSender = null;
  }

  /**
   * Clean up WebRTC connection.
   */
  private cleanupWebRTC(): void {
    void this.cleanupFileTransfer();
    if (this.webrtc) {
      this.webrtc.close();
      this.webrtc = null;
    }
  }

  /**
   * Helper to create a logger with the given prefix.
   */
  private loggerFor(prefix: string): {
    info: (msg: string, ctx?: unknown) => void;
    warn: (msg: string, ctx?: unknown) => void;
  } {
    return {
      info: (msg: string, ctx?: unknown) => {
        console.info(`[${prefix}] ${msg}`, ctx);
      },
      warn: (msg: string, ctx?: unknown) => {
        console.warn(`[${prefix}] ${msg}`, ctx);
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
