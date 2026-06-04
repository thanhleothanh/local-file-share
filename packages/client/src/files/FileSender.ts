import type { ChunkCache } from '@lfs/shared';
import { ACK_TIMEOUT_MS, CHUNK_SIZE, createChunkCache, generateUuid } from '@lfs/shared';
import { encodeChunk } from '@lfs/shared';

export interface FileSenderOptions {
  sendChunk: (chunk: ArrayBuffer) => Promise<void>;
  cache?: ChunkCache;
  /**
   * Timeout in milliseconds to wait for FILE_RECEIVED after sending TRANSFER_DONE.
   * Default: 30000 (30 seconds)
   */
  ackTimeoutMs?: number;
}

export interface FileSenderEvents {
  progress: (fileId: string, bytesSent: number, totalBytes: number) => void;
  /**
   * Called when a file transfer completes successfully (FILE_RECEIVED received)
   */
  complete?: (fileId: string) => void;
  /**
   * Called when a file transfer fails (timeout or NACK rounds exhausted)
   */
  failed?: (fileId: string, error: Error) => void;
}

/**
 * Error thrown when the sender times out waiting for FILE_RECEIVED.
 */
export class FileSendTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSendTimeoutError';
  }
}

export class FileSender {
  private readonly sendChunk: (chunk: ArrayBuffer) => Promise<void>;
  private readonly listeners: Map<
    string,
    Array<(fileId: string, bytesSent: number, totalBytes: number) => void>
  > = new Map();
  private readonly completeListeners: Array<(fileId: string) => void> = [];
  private readonly failedListeners: Array<(fileId: string, error: Error) => void> = [];
  private readonly cache: ChunkCache;
  private readonly ackTimeoutMs: number;
  private readonly pendingTransfers: Map<
    string,
    { timer: ReturnType<typeof setTimeout>; reject: (error: Error) => void }
  > = new Map();

  constructor(options: FileSenderOptions) {
    this.sendChunk = options.sendChunk;
    this.cache = options.cache ?? createChunkCache();
    this.ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS;
  }

  on(event: 'progress', handler: (fileId: string, bytesSent: number, totalBytes: number) => void): () => void;
  on(event: 'complete', handler: (fileId: string) => void): () => void;
  on(event: 'failed', handler: (fileId: string, error: Error) => void): () => void;
  on(event: string, handler: (...args: unknown[]) => void): () => void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as never);
    this.listeners.set(event, handlers);
    return () => {
      const h = this.listeners.get(event) ?? [];
      const index = h.indexOf(handler as never);
      if (index !== -1) {
        h.splice(index, 1);
        this.listeners.set(event, h);
      }
    };
  }

  private emitProgress(fileId: string, bytesSent: number, totalBytes: number): void {
    const listeners = this.listeners.get('progress') ?? [];
    for (const listener of listeners) {
      try {
        listener(fileId, bytesSent, totalBytes);
      } catch {
        // swallow
      }
    }
  }

  private emitComplete(fileId: string): void {
    const listeners = this.listeners.get('complete') ?? [];
    for (const listener of listeners) {
      try {
        listener(fileId);
      } catch {
        // swallow
      }
    }
  }

  private emitFailed(fileId: string, error: Error): void {
    const listeners = this.listeners.get('failed') ?? [];
    for (const listener of listeners) {
      try {
        listener(fileId, error);
      } catch {
        // swallow
      }
    }
  }

  /**
   * Handle an incoming CHUNK_ACK message.
   * Deletes the acknowledged chunk from the cache.
   *
   * @param fileId - The file ID
   * @param index - The chunk index
   * @returns true if the chunk was in the cache and deleted, false otherwise
   */
  handleChunkAck(fileId: string, index: number): boolean {
    return this.cache.delete(fileId, index);
  }

  /**
   * Delete all chunks for a file from the cache.
   * Called when a file transfer completes or fails.
   *
   * @param fileId - The file ID
   */
  deleteFile(fileId: string): void {
    this.cache.deleteFile(fileId);
  }

  /**
   * Get the cache being used by this sender.
   */
  getCache(): ChunkCache {
    return this.cache;
  }

  /**
   * Send a file over the data channel.
   * Slices the file into chunks, encodes each with ChunkCodec, and sends via sendChunk.
   * Each chunk is added to the cache after sending so it can be retransmitted if needed.
   *
   * @param file - The file to send
   * @param fileId - The file ID (defaults to generated UUID)
   * @param waitForAck - If true, waits for FILE_RECEIVED or timeout after sending all chunks
   * @returns Promise that resolves when the file is sent and acknowledged (if waitForAck is true)
   */
  async sendFile(file: File, fileId: string = generateUuid(), waitForAck = false): Promise<void> {
    const totalBytes = file.size;
    let bytesSent = 0;

    // Read file as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Calculate number of chunks
    const chunkCount = Math.ceil(fileBytes.byteLength / CHUNK_SIZE);

    // Send each chunk
    for (let index = 0; index < chunkCount; index++) {
      const offset = index * CHUNK_SIZE;
      const end = Math.min(offset + CHUNK_SIZE, fileBytes.byteLength);
      const chunkData = fileBuffer.slice(offset, end);
      const isLast = index === chunkCount - 1;

      // Encode chunk with header
      const encodedChunk = encodeChunk(fileId, index, isLast, chunkData);

      // Send chunk
      await this.sendChunk(encodedChunk);

      // Store the raw chunk data in the cache (not the encoded version)
      // This is the actual data that would need to be re-sent
      this.cache.add(fileId, index, chunkData);

      bytesSent += chunkData.byteLength;
      this.emitProgress(fileId, bytesSent, totalBytes);
    }

    // If waitForAck is true, return a promise that resolves when FILE_RECEIVED is received
    if (waitForAck) {
      return this.waitForAck(fileId, chunkCount);
    }
  }

  /**
   * Wait for FILE_RECEIVED or timeout after sending TRANSFER_DONE.
   * This is called after all chunks are sent.
   *
   * @param fileId - The file ID
   * @param chunkCount - The total number of chunks sent
   * @param timeoutMs - Timeout in milliseconds (defaults to ackTimeoutMs)
   * @returns Promise that resolves when FILE_RECEIVED is received, or rejects on timeout
   */
  waitForAck(fileId: string, chunkCount: number, timeoutMs: number = this.ackTimeoutMs): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingTransfers.delete(fileId);
        this.cache.deleteFile(fileId);
        this.emitFailed(
          fileId,
          new FileSendTimeoutError(`Timeout waiting for FILE_RECEIVED for file ${fileId}`),
        );
        reject(new FileSendTimeoutError(`Timeout waiting for FILE_RECEIVED for file ${fileId}`));
      }, timeoutMs);

      this.pendingTransfers.set(fileId, { timer, reject });

      // Set up a one-time complete listener for this file
      const unsubscribe = this.on('complete', (receivedFileId) => {
        if (receivedFileId === fileId) {
          clearTimeout(timer);
          this.pendingTransfers.delete(fileId);
          this.cache.deleteFile(fileId);
          this.emitComplete(fileId);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  /**
   * Handle FILE_RECEIVED message.
   * Resolves the pending waitForAck promise for this file.
   *
   * @param fileId - The file ID
   */
  handleFileReceived(fileId: string): void {
    const pending = this.pendingTransfers.get(fileId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingTransfers.delete(fileId);
      this.cache.deleteFile(fileId);
      this.emitComplete(fileId);
    }
  }

  /**
   * Handle CHUNK_REQUEST_NACK message.
   * This is called by the NackHandler after retransmitting chunks.
   * We don't reject the promise here - the sender should retry sending.
   *
   * @param fileId - The file ID
   */
  handleNack(fileId: string): void {
    // NACK handling is done by the NackHandler
    // The waitForAck promise stays pending for the next TRANSFER_DONE/FILE_RECEIVED cycle
    console.info('[FileSender] NACK received, waiting for retransmission and FILE_RECEIVED', { fileId });
  }
}
