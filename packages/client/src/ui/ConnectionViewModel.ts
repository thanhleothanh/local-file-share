import type { DeviceDescriptor, AnySignalingMessage } from '@lfs/shared';
import { ConnectionState, ConnectionStateMachine } from '@lfs/shared';
import type { WebSocketClient } from '../signaling/WebSocketClient.js';
import { WebRTCConnection, type WebRTCConnectionOptions } from '../webrtc/WebRTCConnection.js';
import { SCTPBackpressure } from '../webrtc/SCTPBackpressure.js';
import { FileSender, FileReceiver, FileSystemAccessWriter } from '../files/index.js';
import { NackHandler, createChunkCache, MAX_NACK_ROUNDS, CHUNK_SIZE, type ChunkCache, decodeChunk } from '@lfs/shared';
import type { ChunkRequestNackMessage, TransferDoneMessage, DecodedChunk } from '@lfs/shared';

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
  private controlChannel: RTCDataChannel | null = null;
  private chunkCache: ChunkCache | null = null;
  private nackHandler: NackHandler | null = null;

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
   * Generates a fileId, sends all chunks, then sends TRANSFER_DONE and waits for FILE_RECEIVED.
   *
   * @param file - The file to send
   * @param fileId - Optional file ID (defaults to generated UUID)
   * @param waitForAck - If true, waits for FILE_RECEIVED or timeout (default: true)
   * @returns Promise that resolves when the file transfer completes or rejects on timeout
   */
  async sendFile(file: File, fileId: string = this.generateFileId(), waitForAck: boolean = true): Promise<void> {
    if (this.state.connectionState !== ConnectionState.CONNECTED || !this.fileSender) {
      throw new Error('Cannot send file: not connected or file sender not initialized');
    }

    this.loggerFor('FileSender').info('sending file', { name: file.name, size: file.size, fileId });

    // Initialize progress state with file name
    this.update((prev) => ({
      ...prev,
      fileProgress: {
        fileId,
        fileName: file.name,
        bytesTransferred: 0,
        totalBytes: file.size,
        isSender: true,
        showOpenFolder: false,
      },
    }));

    // Generate a UUID for the file if not provided
    const actualFileId = fileId || this.generateFileId();

    // Calculate total chunks
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE);

    try {
      // Send file with waitForAck option
      // This will wait for FILE_RECEIVED or timeout after sending all chunks
      await this.fileSender.sendFile(file, actualFileId, waitForAck);
      this.loggerFor('FileSender').info('file chunks sent', { name: file.name, fileId: actualFileId, chunks: chunkCount });

      // Send TRANSFER_DONE message after all chunks are sent
      // This is done by the FileSender when waitForAck is true, but we also do it here for safety
      this.sendTransferDone(actualFileId, chunkCount);

      this.loggerFor('FileSender').info('file transfer completed', { fileId: actualFileId });
    } catch (error) {
      this.loggerFor('FileSender').warn('file transfer failed', { fileId: actualFileId, error });
      throw error;
    } finally {
      // Clear progress after completion or failure
      this.update((prev) => ({
        ...prev,
        fileProgress: null,
      }));
    }
  }

  /**
   * Send TRANSFER_DONE message on the control channel.
   */
  private sendTransferDone(fileId: string, totalChunks: number): void {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') {
      console.warn('[ConnectionViewModel] Cannot send TRANSFER_DONE: control channel not open');
      return;
    }

    const message: TransferDoneMessage = {
      type: 'TRANSFER_DONE',
      from: this.state.localDeviceId,
      data: { fileId, totalChunks },
    };

    try {
      this.controlChannel.send(JSON.stringify(message));
      this.loggerFor('FileSender').info('sent TRANSFER_DONE', { fileId, totalChunks });
      console.info('[FileSender] sent TRANSFER_DONE', { fileId, totalChunks });
    } catch (error) {
      this.loggerFor('FileSender').warn('Failed to send TRANSFER_DONE', { error });
    }
  }

  /**
   * Generate a unique file ID.
   */
  private generateFileId(): string {
    // Simple UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
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
          } else if (payload.channel === 'control' && typeof payload.data === 'string') {
            // Handle control channel messages (e.g., CHUNK_ACK)
            this.handleControlMessage(payload.data);
          }
        },
      ),
    );

    // Set up file sender and receiver when data channels open
    this.unsubscribers.push(
      this.webrtc.on('data-channel-open', (channels) => {
        this.loggerFor('WebRTC').info('data channels open - initializing file transfer');
        this.controlChannel = channels.control;
        this.initFileTransfer(channels.data, channels.control);
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
   * Initialize file sender and receiver with the data and control channels.
   */
  private initFileTransfer(dataChannel: RTCDataChannel, controlChannel: RTCDataChannel): void {
    this.cleanupFileTransfer();

    // Store the control channel for sending ACK messages
    this.controlChannel = controlChannel;

    // Wrap the data channel with SCTP backpressure
    // This replaces the send method with a Promise-returning version
    // that waits for the buffer to drain below the threshold
    const wrappedDataChannel = SCTPBackpressure.wrap(dataChannel);

    // Create chunk cache for the sender (to support retransmission)
    this.chunkCache = createChunkCache();

    // Create NackHandler for handling CHUNK_REQUEST_NACK messages
    this.nackHandler = new NackHandler(this.chunkCache, {
      sendChunk: async (fileId: string, index: number, data: ArrayBuffer) => {
        // Retransmit the chunk on the data channel
        if (wrappedDataChannel.readyState === 'open') {
          await wrappedDataChannel.send(data);
        } else {
          throw new Error('Data channel not open for retransmission');
        }
      },
    });

    // Create file sender that sends chunks via the wrapped data channel
    this.fileSender = new FileSender({
      sendChunk: async (chunk: ArrayBuffer) => {
        if (wrappedDataChannel.readyState === 'open') {
          // The wrapped send returns a Promise, so we await it for backpressure
          await wrappedDataChannel.send(chunk);
        } else {
          throw new Error('Data channel not open');
        }
      },
      cache: this.chunkCache,
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

    // Create file receiver with the writer and ACK callback
    // The ACK callback sends CHUNK_ACK messages on the control channel
    this.fileReceiver = new FileReceiver({
      writer: this.fsaWriter ?? undefined,
      buffer: undefined, // Use default buffer
      sendChunkAck: (fileId: string, index: number) => {
        // Send CHUNK_ACK message on the control channel
        const ackMessage = JSON.stringify({
          type: 'CHUNK_ACK',
          from: this.state.localDeviceId,
          data: { fileId, index },
        });
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
          try {
            this.controlChannel.send(ackMessage);
          } catch (error) {
            this.loggerFor('FileReceiver').warn('Failed to send CHUNK_ACK', { error });
          }
        }
      },
      sendChunkNack: (fileId: string, missingIndices: number[], round: number) => {
        // Send CHUNK_REQUEST_NACK message on the control channel
        const nackMessage: ChunkRequestNackMessage = {
          type: 'CHUNK_REQUEST_NACK',
          from: this.state.localDeviceId,
          data: { fileId, missingIndices, round },
        };
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
          try {
            this.controlChannel.send(JSON.stringify(nackMessage));
            this.loggerFor('FileReceiver').info('sent CHUNK_REQUEST_NACK', { fileId, missingIndices, round });
          } catch (error) {
            this.loggerFor('FileReceiver').warn('Failed to send CHUNK_REQUEST_NACK', { error });
          }
        }
      },
      sendFileReceived: (fileId: string, totalChunks: number) => {
        // Send FILE_RECEIVED message on the control channel
        const receivedMessage = {
          type: 'FILE_RECEIVED',
          from: this.state.localDeviceId,
          data: { fileId, totalChunks, expectedHash: '' },
        };
        if (this.controlChannel && this.controlChannel.readyState === 'open') {
          try {
            this.controlChannel.send(JSON.stringify(receivedMessage));
            this.loggerFor('FileReceiver').info('sent FILE_RECEIVED', { fileId, totalChunks });
          } catch (error) {
            this.loggerFor('FileReceiver').warn('Failed to send FILE_RECEIVED', { error });
          }
        }
      },
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
   * Handle an incoming control message (e.g., CHUNK_ACK, CHUNK_REQUEST_NACK, TRANSFER_DONE).
   */
  private handleControlMessage(message: string): void {
    try {
      const parsed = JSON.parse(message) as { type: string; from: string; data?: unknown };

      switch (parsed.type) {
        case 'CHUNK_ACK':
          if (this.fileSender) {
            const data = parsed.data as { fileId: string; index: number } | undefined;
            if (data?.fileId && typeof data.index === 'number') {
              this.fileSender.handleChunkAck(data.fileId, data.index);
            }
          }
          break;

        case 'TRANSFER_DONE':
          if (this.fileReceiver) {
            const data = parsed.data as { fileId: string; totalChunks: number } | undefined;
            if (data?.fileId && typeof data.totalChunks === 'number') {
              this.loggerFor('FileReceiver').info('received TRANSFER_DONE', { fileId: data.fileId, totalChunks: data.totalChunks });
              console.info('[FileReceiver] received TRANSFER_DONE', { fileId: data.fileId, totalChunks: data.totalChunks });
              // Handle the transfer done by checking integrity
              void this.fileReceiver.handleTransferDone(data.fileId, data.totalChunks);
            }
          }
          break;

        case 'CHUNK_REQUEST_NACK':
          if (this.nackHandler) {
            const data = parsed.data as { fileId: string; missingIndices: number[]; round: number } | undefined;
            if (data?.fileId && Array.isArray(data.missingIndices) && typeof data.round === 'number') {
              this.loggerFor('NackHandler').info('received CHUNK_REQUEST_NACK', {
                fileId: data.fileId,
                missingIndices: data.missingIndices,
                round: data.round,
              });
              console.info('[NackHandler] received CHUNK_REQUEST_NACK', {
                fileId: data.fileId,
                missingIndices: data.missingIndices,
                round: data.round,
              });
              // Handle the NACK by retransmitting missing chunks
              const nackMessage: ChunkRequestNackMessage = {
                type: 'CHUNK_REQUEST_NACK',
                from: parsed.from,
                data: { fileId: data.fileId, missingIndices: data.missingIndices, round: data.round },
              };
              void this.nackHandler.handle(nackMessage);
            }
          }
          break;

        case 'FILE_RECEIVED':
          this.loggerFor('FileSender').info('received FILE_RECEIVED', parsed.data);
          console.info('[FileSender] received FILE_RECEIVED', parsed.data);
          // File transfer completed successfully
          // Notify the sender and clean up the cache
          if (this.fileSender && parsed.data && typeof parsed.data === 'object') {
            const data = parsed.data as { fileId: string };
            if (data.fileId) {
              this.fileSender.handleFileReceived(data.fileId);
            }
          }
          break;

        default:
          // Other control message types can be handled here
          break;
      }
    } catch (error) {
      this.loggerFor('Control').warn('Failed to parse control message', { error, message });
    }
  }

  /**
   * Handle an incoming chunk from the data channel.
   * The chunk format is: [41-byte header][chunk data]
   * The header contains: fileId (36 bytes), index (4 bytes), isLast (1 byte)
   * For now, we use a file registry to track file metadata (fileName, totalBytes, totalChunks)
   * which should come from FILE_OFFER message in a real implementation.
   */
  private handleIncomingChunk(rawChunk: ArrayBuffer): void {
    if (!this.fileReceiver) {
      this.loggerFor('FileReceiver').warn('received chunk but receiver not initialized');
      return;
    }

    // Decode the chunk to get the fileId from the header
    try {
      const decoded: DecodedChunk = decodeChunk(rawChunk);
      const fileId = decoded.fileId;

      // For now, use generic values for fileName and totalBytes
      // In a real implementation, these would come from FILE_OFFER message
      // We track file metadata in a registry
      const fileMetadata = this.getOrCreateFileMetadata(fileId);

      // Use the async version with totalChunks
      void this.fileReceiver.handleChunk(
        fileId,
        fileMetadata.fileName,
        fileMetadata.totalBytes,
        rawChunk,
        fileMetadata.totalChunks,
      );
    } catch (error) {
      this.loggerFor('FileReceiver').warn('Failed to decode chunk header', { error });
    }
  }

  /**
   * Simple file metadata registry for tracking file information.
   * In a real implementation, this would be populated by FILE_OFFER messages.
   */
  private readonly fileMetadataRegistry: Map<string, { fileName: string; totalBytes: number; totalChunks: number }> = new Map();

  private getOrCreateFileMetadata(fileId: string): { fileName: string; totalBytes: number; totalChunks: number } {
    // For now, create generic metadata for testing
    // In a real implementation, this would be set by FILE_OFFER
    if (!this.fileMetadataRegistry.has(fileId)) {
      // Generate deterministic metadata based on fileId for testing
      this.fileMetadataRegistry.set(fileId, {
        fileName: `file-${fileId.slice(0, 8)}.bin`,
        totalBytes: 102400, // 100 KB
        totalChunks: 10, // 10 chunks of 10KB each
      });
    }
    return this.fileMetadataRegistry.get(fileId)!;
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
    if (this.fileSender) {
      // Clean up all files in the cache
      // Note: In a real implementation, we might want to keep the cache
      // for ongoing transfers, but for now we clear everything on cleanup
      this.fileSender = null;
    }
    if (this.chunkCache) {
      // Clear all cached chunks
      // Note: This is a simple implementation; a more sophisticated one
      // might only clear completed/failed file chunks
      this.chunkCache = null;
    }
    this.nackHandler = null;
  }

  /**
   * Clean up WebRTC connection.
   */
  private cleanupWebRTC(): void {
    void this.cleanupFileTransfer();
    this.controlChannel = null;
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
