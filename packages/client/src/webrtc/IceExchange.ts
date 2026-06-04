import type { AnySignalingMessage, IceCandidateData } from '@lfs/shared';
import { Logger } from '@lfs/shared';

/**
 * Handles ICE candidate exchange between WebRTC and the signaling server.
 * Buffers candidates that arrive before setRemoteDescription resolves.
 */
export interface IceExchangeOptions {
  logger?: Logger;
}

export interface IceExchangeEvents {
  iceCandidate: (candidate: RTCIceCandidateInit) => void;
}

export class IceExchange {
  private readonly logger: Logger;
  private candidateBuffer: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private readonly listeners = new Map<
    keyof IceExchangeEvents,
    Set<(candidate: RTCIceCandidateInit) => void>
  >();

  constructor(options: IceExchangeOptions = {}) {
    this.logger = options.logger ?? new Logger('IceExchange');
  }

  /**
   * Call this when a remote description has been set successfully.
   * This will flush any buffered ICE candidates.
   */
  onRemoteDescriptionSet(): void {
    this.remoteDescriptionSet = true;
    this.flushBuffer();
  }

  /**
   * Handle an incoming ICE candidate message from the signaling server.
   * If remote description is already set, emit immediately.
   * Otherwise, buffer the candidate.
   */
  handleIncomingIceCandidate(message: AnySignalingMessage): void {
    const data = message.data as IceCandidateData | undefined;
    if (!data?.candidate) {
      this.logger.warn('received ice-candidate without candidate data');
      return;
    }

    const candidate: RTCIceCandidateInit = {
      candidate: data.candidate,
      sdpMid: data.sdpMid ?? null,
      sdpMLineIndex: data.sdpMLineIndex ?? null,
    };

    this.logger.info('received ICE candidate', {
      candidate: `${(data.candidate ?? '').substring(0, 50)}...`,
    });

    if (this.remoteDescriptionSet) {
      this.emitIceCandidate(candidate);
    } else {
      this.logger.info('buffering ICE candidate (remote description not set yet)', {
        bufferedCount: this.candidateBuffer.length + 1,
      });
      this.candidateBuffer.push(candidate);
    }
  }

  /**
   * Create an ICE candidate message for sending to the signaling server.
   */
  createIceCandidateMessage(
    candidate: RTCIceCandidate,
    targetDeviceId: string,
    fromDeviceId: string,
  ): AnySignalingMessage {
    return {
      type: 'ice-candidate',
      from: fromDeviceId,
      to: targetDeviceId,
      data: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Subscribe to ICE candidate events.
   */
  on(event: keyof IceExchangeEvents, handler: (candidate: RTCIceCandidateInit) => void): () => void {
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

  /**
   * Clear any buffered candidates (e.g., on connection reset).
   */
  clear(): void {
    this.candidateBuffer = [];
    this.remoteDescriptionSet = false;
  }

  private emitIceCandidate(candidate: RTCIceCandidateInit): void {
    const handlers = this.listeners.get('iceCandidate');
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(candidate);
        } catch (err) {
          this.logger.error('iceCandidate handler threw', { error: (err as Error).message });
        }
      }
    }
  }

  private flushBuffer(): void {
    if (this.candidateBuffer.length === 0) return;

    this.logger.info('flushing buffered ICE candidates', { count: this.candidateBuffer.length });

    for (const candidate of this.candidateBuffer) {
      this.emitIceCandidate(candidate);
    }
    this.candidateBuffer = [];
  }
}
