import type { ChunkCache } from '@lfs/shared';
import { CHUNK_SIZE, createChunkCache, generateUuid } from '@lfs/shared';
import { encodeChunk } from '@lfs/shared';

export interface FileSenderOptions {
  sendChunk: (chunk: ArrayBuffer) => Promise<void>;
  cache?: ChunkCache;
}

export interface FileSenderEvents {
  progress: (fileId: string, bytesSent: number, totalBytes: number) => void;
}

export class FileSender {
  private readonly sendChunk: (chunk: ArrayBuffer) => Promise<void>;
  private readonly listeners: Array<(fileId: string, bytesSent: number, totalBytes: number) => void> = [];
  private readonly cache: ChunkCache;

  constructor(options: FileSenderOptions) {
    this.sendChunk = options.sendChunk;
    this.cache = options.cache ?? createChunkCache();
  }

  on(
    _event: 'progress',
    handler: (fileId: string, bytesSent: number, totalBytes: number) => void,
  ): () => void {
    this.listeners.push(handler);
    return () => {
      const index = this.listeners.indexOf(handler);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private emitProgress(fileId: string, bytesSent: number, totalBytes: number): void {
    for (const listener of this.listeners) {
      try {
        listener(fileId, bytesSent, totalBytes);
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
   */
  async sendFile(file: File, fileId: string = generateUuid()): Promise<void> {
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
  }
}
