import type { AnySignalingMessage } from '@lfs/shared';
import { Logger } from '@lfs/shared';
import type { WebSocketClient } from '../signaling/WebSocketClient.js';
import { DataChannelFactory, type DataChannelPair } from './DataChannelFactory.js';
import { IceExchange } from './IceExchange.js';

/**
 * Configuration options for WebRTCConnection.
 */
export interface WebRTCConnectionOptions {
  signalingClient: WebSocketClient;
  localDeviceId: string;
  targetDeviceId: string;
  isOfferer: boolean;
  logger?: Logger;
  iceServers?: RTCIceServer[];
}

/**
 * Events emitted by WebRTCConnection.
 */
export interface WebRTCConnectionEvents {
  'data-channel-open': (channels: DataChannelPair) => void;
  'data-channel-close': () => void;
  'ice-candidate': (candidate: RTCIceCandidate) => void;
  'connection-state-change': (state: RTCPeerConnectionState) => void;
  'ice-connection-state-change': (state: RTCIceConnectionState) => void;
  'data-channel-message': (channel: 'control' | 'data', data: string | ArrayBuffer) => void;
}

export type WebRTCConnectionEvent = keyof WebRTCConnectionEvents;

/**
 * Manages the WebRTC peer connection lifecycle, including:
 * - Offer/Answer exchange via signaling server
 * - ICE candidate exchange
 * - Data channel creation and management
 */
export class WebRTCConnection {
  private readonly signalingClient: WebSocketClient;
  private readonly localDeviceId: string;
  private readonly targetDeviceId: string;
  private readonly isOfferer: boolean;
  private readonly logger: Logger;
  private readonly iceServers: RTCIceServer[];

  private peer: RTCPeerConnection | null = null;
  private dataChannels: DataChannelPair | null = null;
  private iceExchange: IceExchange;
  private readonly listeners = new Map<WebRTCConnectionEvent, Set<(...args: any[]) => void>>();
  private closing = false;

  constructor(options: WebRTCConnectionOptions) {
    this.signalingClient = options.signalingClient;
    this.localDeviceId = options.localDeviceId;
    this.targetDeviceId = options.targetDeviceId;
    this.isOfferer = options.isOfferer;
    this.logger = options.logger ?? new Logger('WebRTCConnection');
    this.iceServers = options.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
    this.iceExchange = new IceExchange({ logger: this.logger.child('IceExchange') });
  }

  /**
   * Initiate the WebRTC connection as the offerer.
   * Creates the peer connection, data channels, and sends the offer.
   */
  async connect(): Promise<void> {
    if (this.peer !== null) {
      this.logger.warn('already connecting or connected');
      return;
    }

    this.logger.info('connect: creating peer connection as offerer', {
      localDeviceId: this.localDeviceId,
      targetDeviceId: this.targetDeviceId,
    });

    this.peer = this.createPeerConnection();
    this.setupPeerConnectionListeners();
    this.setupDataChannels();

    await this.createAndSendOffer();
  }

  /**
   * Accept an incoming connection request as the answerer.
   * Creates the peer connection and waits for the offer.
   */
  async accept(): Promise<void> {
    if (this.peer !== null) {
      this.logger.warn('already connecting or connected');
      return;
    }

    this.logger.info('accept: creating peer connection as answerer', {
      localDeviceId: this.localDeviceId,
      targetDeviceId: this.targetDeviceId,
    });

    this.peer = this.createPeerConnection();
    this.setupPeerConnectionListeners();
    // Don't create data channels as answerer - they'll be created by the offerer
    // and we'll receive them via the datachannel event
    this.setupDataChannelListeners();
  }

  /**
   * Handle an incoming SDP offer from the signaling server.
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peer) {
      this.logger.error('handleOffer: peer connection not initialized');
      return;
    }

    this.logger.info('handling remote offer');
    try {
      await this.peer.setRemoteDescription(offer);
      this.iceExchange.onRemoteDescriptionSet();
      await this.createAndSendAnswer();
    } catch (err) {
      this.logger.error('failed to handle offer', { error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Handle an incoming SDP answer from the signaling server.
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peer) {
      this.logger.error('handleAnswer: peer connection not initialized');
      return;
    }

    this.logger.info('handling remote answer');
    try {
      await this.peer.setRemoteDescription(answer);
      this.iceExchange.onRemoteDescriptionSet();
    } catch (err) {
      this.logger.error('failed to handle answer', { error: (err as Error).message });
      throw err;
    }
  }

  /**
   * Handle an incoming ICE candidate from the signaling server.
   */
  handleIceCandidate(message: AnySignalingMessage): void {
    this.iceExchange.handleIncomingIceCandidate(message);
  }

  /**
   * Send a message over the control data channel.
   */
  sendControl(message: string | object): boolean {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    const channel = this.dataChannels?.control;
    if (!channel || channel.readyState !== 'open') {
      this.logger.warn('control channel not ready, cannot send message');
      return false;
    }

    try {
      channel.send(data);
      return true;
    } catch (err) {
      this.logger.error('failed to send control message', { error: (err as Error).message });
      return false;
    }
  }

  /**
   * Send a message over the data data channel.
   */
  sendData(message: unknown): boolean {
    const channel = this.dataChannels?.data;
    if (!channel || channel.readyState !== 'open') {
      this.logger.warn('data channel not ready, cannot send message');
      return false;
    }

    try {
      channel.send(message as Parameters<RTCDataChannel['send']>[0]);
      return true;
    } catch (err) {
      this.logger.error('failed to send data message', { error: (err as Error).message });
      return false;
    }
  }

  /**
   * Close the connection.
   * Sends a CLOSE message on the control channel (best-effort).
   * Idempotent - can be called multiple times safely.
   */
  close(): void {
    if (this.closing) return;
    this.closing = true;

    this.logger.info('closing connection');

    // Send CLOSE message on control channel (best-effort)
    if (this.dataChannels?.control && this.dataChannels.control.readyState === 'open') {
      try {
        this.dataChannels.control.send(JSON.stringify({ type: 'CLOSE', reason: 'user disconnect' }));
      } catch {
        /* ignore */
      }
    }

    // Close data channels
    if (this.dataChannels) {
      try {
        this.dataChannels.control.close();
      } catch {
        /* ignore */
      }
      try {
        this.dataChannels.data.close();
      } catch {
        /* ignore */
      }
      this.dataChannels = null;
    }

    // Close peer connection
    if (this.peer) {
      try {
        this.peer.close();
      } catch {
        /* ignore */
      }
      this.peer = null;
    }

    this.iceExchange.clear();
    this.closing = false;

    this.emit('data-channel-close', undefined);
  }

  /**
   * Get the current data channels.
   */
  getChannels(): DataChannelPair | null {
    return this.dataChannels;
  }

  /**
   * Get the current peer connection.
   */
  getPeer(): RTCPeerConnection | null {
    return this.peer;
  }

  /**
   * Subscribe to WebRTCConnection events.
   */
  on(event: WebRTCConnectionEvent, handler: (...args: any[]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  private createPeerConnection(): RTCPeerConnection {
    const configuration: RTCConfiguration = {
      iceServers: this.iceServers,
    };

    const peer = new RTCPeerConnection(configuration);

    // Set up ICE candidate handling
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.logger.info('generated ICE candidate');
        this.emit('ice-candidate', event.candidate);

        // Send the candidate to the target via signaling server
        const message = this.iceExchange.createIceCandidateMessage(
          event.candidate,
          this.targetDeviceId,
          this.localDeviceId,
        );
        this.signalingClient.send(message);
      }
    };

    // Set up data channel handling for answerer
    peer.ondatachannel = (event) => {
      this.logger.info('received data channel', { label: event.channel.label });
      this.handleIncomingDataChannel(event.channel);
    };

    return peer;
  }

  private setupPeerConnectionListeners(): void {
    if (!this.peer) return;

    this.peer.onconnectionstatechange = () => {
      const state = this.peer!.connectionState;
      this.logger.info('connection state changed', { state });
      this.emit('connection-state-change', state);
    };

    this.peer.oniceconnectionstatechange = () => {
      const state = this.peer!.iceConnectionState;
      this.logger.info('ICE connection state changed', { state });
      this.emit('ice-connection-state-change', state);
    };
  }

  private setupDataChannels(): void {
    if (!this.peer) return;

    this.dataChannels = DataChannelFactory.createStandardChannels(this.peer);
    this.setupDataChannelListeners();
  }

  private setupDataChannelListeners(): void {
    if (!this.dataChannels) return;

    // Control channel listeners
    this.dataChannels.control.onopen = () => {
      this.logger.info('control channel opened');
      this.checkChannelsReady();
    };

    this.dataChannels.control.onclose = () => {
      this.logger.info('control channel closed');
      this.emit('data-channel-close', undefined);
    };

    this.dataChannels.control.onmessage = (event) => {
      this.emit('data-channel-message', { channel: 'control' as const, data: event.data });
    };

    // Data channel listeners
    this.dataChannels.data.onopen = () => {
      this.logger.info('data channel opened');
      this.checkChannelsReady();
    };

    this.dataChannels.data.onclose = () => {
      this.logger.info('data channel closed');
      this.emit('data-channel-close', undefined);
    };

    this.dataChannels.data.onmessage = (event) => {
      this.emit('data-channel-message', { channel: 'data' as const, data: event.data });
    };

    // ICE candidate listener for local candidates
    this.on('ice-candidate', (candidate: RTCIceCandidate) => {
      const message = this.iceExchange.createIceCandidateMessage(
        candidate,
        this.targetDeviceId,
        this.localDeviceId,
      );
      this.signalingClient.send(message);
    });

    // ICE candidate listener from remote
    this.iceExchange.on('iceCandidate', (candidate: RTCIceCandidateInit) => {
      this.addIceCandidate(candidate);
    });
  }

  private handleIncomingDataChannel(channel: RTCDataChannel): void {
    this.logger.info('setting up incoming data channel', { label: channel.label });

    if (!this.dataChannels) {
      this.dataChannels = {
        control: null as unknown as RTCDataChannel,
        data: null as unknown as RTCDataChannel,
      };
    }

    if (channel.label === 'control') {
      this.dataChannels.control = channel;
    } else if (channel.label === 'data') {
      this.dataChannels.data = channel;
    }

    channel.onopen = () => {
      this.logger.info('incoming data channel opened', { label: channel.label });
      this.checkChannelsReady();
    };

    channel.onclose = () => {
      this.logger.info('incoming data channel closed', { label: channel.label });
      this.emit('data-channel-close', undefined);
    };

    channel.onmessage = (event) => {
      const channelLabel = channel.label === 'control' ? 'control' : 'data';
      this.emit('data-channel-message', { channel: channelLabel as 'control' | 'data', data: event.data });
    };

    this.checkChannelsReady();
  }

  private checkChannelsReady(): void {
    if (!this.dataChannels) return;

    const controlReady = this.dataChannels.control?.readyState === 'open';
    const dataReady = this.dataChannels.data?.readyState === 'open';

    if (controlReady && dataReady) {
      this.logger.info('both data channels are open');
      this.emit('data-channel-open', this.dataChannels);

      // Send the hello message as the offerer
      if (this.isOfferer) {
        this.sendHello();
      }
    }
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peer) throw new Error('Peer connection not initialized');

    this.logger.info('creating offer');
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    this.logger.info('sending offer via signaling');
    const message: AnySignalingMessage = {
      type: 'offer',
      from: this.localDeviceId,
      to: this.targetDeviceId,
      data: {
        sdp: offer.sdp!,
        type: 'offer',
      },
      timestamp: Date.now(),
    };
    this.signalingClient.send(message);
  }

  private async createAndSendAnswer(): Promise<void> {
    if (!this.peer) throw new Error('Peer connection not initialized');

    this.logger.info('creating answer');
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);

    this.logger.info('sending answer via signaling');
    const message: AnySignalingMessage = {
      type: 'answer',
      from: this.localDeviceId,
      to: this.targetDeviceId,
      data: {
        sdp: answer.sdp!,
        type: 'answer',
      },
      timestamp: Date.now(),
    };
    this.signalingClient.send(message);
  }

  private addIceCandidate(candidate: RTCIceCandidateInit): void {
    if (!this.peer) {
      this.logger.warn('addIceCandidate: peer connection not initialized');
      return;
    }

    this.logger.info('adding ICE candidate');
    try {
      this.peer.addIceCandidate(candidate);
    } catch (err) {
      this.logger.error('failed to add ICE candidate', { error: (err as Error).message });
    }
  }

  private sendHello(): void {
    this.logger.info('sending hello message');
    const channel = this.dataChannels?.data;
    if (channel && channel.readyState === 'open') {
      channel.send('hello');
    }
  }

  private emit(event: WebRTCConnectionEvent, payload: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          this.logger.error('event handler threw', { event, error: (err as Error).message });
        }
      }
    }
  }
}
