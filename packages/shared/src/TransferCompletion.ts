/**
 * TransferCompletion handles the final handshake that closes out a file transfer.
 * On the sender side: sends TRANSFER_DONE and waits for FILE_RECEIVED or CHUNK_REQUEST_NACK.
 * On the receiver side: runs integrity check after TRANSFER_DONE and sends the appropriate response.
 */

import type { ChunkBuffer } from './ChunkBuffer.js';
import type { FileIntegrityChecker } from './FileIntegrityChecker.js';

/**
 * Error thrown when the sender times out waiting for FILE_RECEIVED.
 */
export class AckTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AckTimeoutError';
  }
}

/**
 * Interface for sending control messages.
 */
export interface ControlChannelSender {
  send(message: string | ArrayBuffer): void;
}

/**
 * Interface for handling NACK messages (sender side).
 */
export interface NackHandlerInterface {
  handle(message: { type: string; from: string; data: { fileId: string; missingIndices: number[]; round: number } }): Promise<number[]>;
}

/**
 * Sender-side TransferCompletion.
 * Sends TRANSFER_DONE and waits for FILE_RECEIVED or CHUNK_REQUEST_NACK.
 */
export class SenderTransferCompletion {
  private readonly controlChannel: ControlChannelSender;
  private readonly nackHandler: NackHandlerInterface;
  private readonly localDeviceId: string;
  private readonly pending: Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map();

  constructor(
    controlChannel: ControlChannelSender,
    nackHandler: NackHandlerInterface,
    localDeviceId: string,
  ) {
    this.controlChannel = controlChannel;
    this.nackHandler = nackHandler;
    this.localDeviceId = localDeviceId;
  }

  /**
   * Send TRANSFER_DONE message on the control channel.
   *
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks sent
   */
  sendDone(fileId: string, totalChunks: number): void {
    const message = JSON.stringify({
      type: 'TRANSFER_DONE',
      from: this.localDeviceId,
      data: { fileId, totalChunks },
    });
    try {
      this.controlChannel.send(message);
    } catch (error) {
      console.error('[SenderTransferCompletion] Failed to send TRANSFER_DONE:', error);
    }
  }

  /**
   * Wait for FILE_RECEIVED or CHUNK_REQUEST_NACK response.
   * Resolves when FILE_RECEIVED is received.
   * Rejects with AckTimeoutError if neither arrives within timeoutMs.
   * Handles CHUNK_REQUEST_NACK by triggering retransmission via the NackHandler.
   *
   * @param fileId - The file ID
   * @param timeoutMs - Timeout in milliseconds (default: 30000)
   * @returns Promise that resolves when FILE_RECEIVED is received
   */
  awaitFileReceived(fileId: string, timeoutMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      // Store the promise callbacks for this file
      const timer = setTimeout(() => {
        this.pending.delete(fileId);
        reject(new AckTimeoutError(`Timeout waiting for FILE_RECEIVED for file ${fileId}`));
      }, timeoutMs);

      this.pending.set(fileId, { resolve, reject, timer });
    });
  }

  /**
   * Handle an incoming FILE_RECEIVED message.
   * Resolves the pending promise for this file.
   *
   * @param fileId - The file ID
   */
  handleFileReceived(fileId: string): void {
    const pending = this.pending.get(fileId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(fileId);
      pending.resolve();
    }
  }

  /**
   * Handle an incoming CHUNK_REQUEST_NACK message.
   * Triggers retransmission via the NackHandler and rejects the pending promise.
   *
   * @param message - The CHUNK_REQUEST_NACK message
   */
  async handleChunkRequestNack(
    message: { type: string; from: string; data: { fileId: string; missingIndices: number[]; round: number } },
  ): Promise<void> {
    const { fileId } = message.data;
    const pending = this.pending.get(fileId);

    if (pending) {
      // Trigger retransmission
      try {
        await this.nackHandler.handle(message);
      } catch (error) {
        console.error('[SenderTransferCompletion] NACK handling failed:', error);
      }

      // Note: We don't reject here because NACK is expected and retransmission happens
      // The sender should wait for the next TRANSFER_DONE/FILE_RECEIVED cycle
    }
  }

  /**
   * Cancel a pending file transfer.
   *
   * @param fileId - The file ID
   */
  cancel(fileId: string): void {
    const pending = this.pending.get(fileId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(fileId);
      pending.reject(new Error(`File transfer cancelled: ${fileId}`));
    }
  }

  /**
   * Clean up all pending transfers.
   */
  clear(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('All transfers cleared'));
    }
    this.pending.clear();
  }
}

/**
 * Receiver-side TransferCompletion.
 * Runs integrity check after TRANSFER_DONE and sends the appropriate response.
 */
export class ReceiverTransferCompletion {
  private readonly controlChannel: ControlChannelSender;
  private readonly integrityChecker: FileIntegrityChecker;
  private readonly localDeviceId: string;
  private readonly nackRounds: Map<string, number> = new Map();
  private readonly MAX_NACK_ROUNDS = 3;

  constructor(
    controlChannel: ControlChannelSender,
    integrityChecker: FileIntegrityChecker,
    localDeviceId: string,
  ) {
    this.controlChannel = controlChannel;
    this.integrityChecker = integrityChecker;
    this.localDeviceId = localDeviceId;
  }

  /**
   * Handle TRANSFER_DONE message from sender.
   * Performs integrity check and sends FILE_RECEIVED or CHUNK_REQUEST_NACK.
   *
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks sent by the sender
   * @returns true if the file is complete and FILE_RECEIVED was sent, false otherwise
   */
  handleTransferDone(fileId: string, totalChunks: number): boolean {
    // Get the current round
    const currentRound = this.nackRounds.get(fileId) ?? 0;

    // Check if we've exceeded the maximum NACK rounds
    if (currentRound >= this.MAX_NACK_ROUNDS) {
      console.warn('[ReceiverTransferCompletion] Maximum NACK rounds exceeded, file should be marked FAILED', { fileId, round: currentRound });
      return false;
    }

    // Perform integrity check
    const result = this.integrityChecker.check(fileId, totalChunks);

    if (result.complete) {
      // All chunks received - send FILE_RECEIVED
      this.sendFileReceived(fileId, totalChunks);
      // Clean up tracking
      this.nackRounds.delete(fileId);
      return true;
    } else {
      // Missing chunks detected - send CHUNK_REQUEST_NACK
      this.sendChunkRequestNack(fileId, result.missingIndices, currentRound);
      // Increment round counter
      this.nackRounds.set(fileId, currentRound + 1);
      return false;
    }
  }

  /**
   * Send FILE_RECEIVED message on the control channel.
   *
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks
   */
  private sendFileReceived(fileId: string, totalChunks: number): void {
    const message = JSON.stringify({
      type: 'FILE_RECEIVED',
      from: this.localDeviceId,
      data: { fileId, totalChunks, expectedHash: '' },
    });
    try {
      this.controlChannel.send(message);
    } catch (error) {
      console.error('[ReceiverTransferCompletion] Failed to send FILE_RECEIVED:', error);
    }
  }

  /**
   * Send CHUNK_REQUEST_NACK message on the control channel.
   *
   * @param fileId - The file ID
   * @param missingIndices - The list of missing chunk indices
   * @param round - The current NACK round
   */
  private sendChunkRequestNack(fileId: string, missingIndices: number[], round: number): void {
    const message = JSON.stringify({
      type: 'CHUNK_REQUEST_NACK',
      from: this.localDeviceId,
      data: { fileId, missingIndices, round },
    });
    try {
      this.controlChannel.send(message);
    } catch (error) {
      console.error('[ReceiverTransferCompletion] Failed to send CHUNK_REQUEST_NACK:', error);
    }
  }

  /**
   * Clean up tracking for a file.
   *
   * @param fileId - The file ID
   */
  clearFile(fileId: string): void {
    this.nackRounds.delete(fileId);
  }

  /**
   * Clean up all tracking.
   */
  clear(): void {
    this.nackRounds.clear();
  }
}
