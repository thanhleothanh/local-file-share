import type { DecodedChunk } from '@lfs/shared';
import { decodeChunk } from '@lfs/shared';
import type { FileSystemWriter } from './FileSystemWriter.js';

export interface FileReceiverEvents {
  chunk: (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
  assembled: (fileId: string, fileName: string, byteLength: number) => void;
  progress: (fileId: string, bytesReceived: number, totalBytes: number) => void;
}

export interface FileReceiverOptions {
  onChunkCallback?: (chunk: DecodedChunk) => void;
  writer?: FileSystemWriter | undefined;
}

type ChunkHandler = (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
type AssembledHandler = (fileId: string, fileName: string, byteLength: number) => void;
type ProgressHandler = (fileId: string, bytesReceived: number, totalBytes: number) => void;

export class FileReceiver {
  // Map of fileId -> Map of index -> ArrayBuffer
  private readonly chunkBuffers: Map<string, Map<number, ArrayBuffer>> = new Map();
  private readonly chunkFileNames: Map<string, string> = new Map();
  private readonly chunkFileSizes: Map<string, number> = new Map();
  private readonly chunkListeners: ChunkHandler[] = [];
  private readonly assembledListeners: AssembledHandler[] = [];
  private readonly progressListeners: ProgressHandler[] = [];
  private readonly onChunkCallback: ((chunk: DecodedChunk) => void) | undefined;
  private readonly writer: FileSystemWriter | undefined;

  constructor(options: FileReceiverOptions = {}) {
    this.onChunkCallback = options.onChunkCallback;
    this.writer = options.writer;
  }

  onChunk(handler: ChunkHandler): () => void {
    this.chunkListeners.push(handler);
    return () => {
      const index = this.chunkListeners.indexOf(handler);
      if (index !== -1) {
        this.chunkListeners.splice(index, 1);
      }
    };
  }

  onAssembled(handler: AssembledHandler): () => void {
    this.assembledListeners.push(handler);
    return () => {
      const index = this.assembledListeners.indexOf(handler);
      if (index !== -1) {
        this.assembledListeners.splice(index, 1);
      }
    };
  }

  onProgress(handler: ProgressHandler): () => void {
    this.progressListeners.push(handler);
    return () => {
      const index = this.progressListeners.indexOf(handler);
      if (index !== -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  private emitChunk(fileId: string, index: number, data: ArrayBuffer, isLast: boolean): void {
    for (const listener of this.chunkListeners) {
      try {
        listener(fileId, index, data, isLast);
      } catch {
        // swallow
      }
    }
  }

  private emitAssembled(fileId: string, fileName: string, byteLength: number): void {
    for (const listener of this.assembledListeners) {
      try {
        listener(fileId, fileName, byteLength);
      } catch {
        // swallow
      }
    }
  }

  private emitProgress(fileId: string, bytesReceived: number, totalBytes: number): void {
    for (const listener of this.progressListeners) {
      try {
        listener(fileId, bytesReceived, totalBytes);
      } catch {
        // swallow
      }
    }
  }

  /**
   * Handle an incoming raw chunk (encoded with header).
   * Decodes it and stores it in the buffer.
   */
  async handleChunk(
    fileId: string,
    fileName: string,
    totalBytes: number,
    rawChunk: ArrayBuffer,
  ): Promise<void> {
    const decoded = decodeChunk(rawChunk);

    // Store the filename and total bytes for this fileId if not already stored
    if (!this.chunkFileNames.has(fileId)) {
      this.chunkFileNames.set(fileId, fileName);
      this.chunkFileSizes.set(fileId, totalBytes);
    }

    // Call optional chunk callback
    if (this.onChunkCallback) {
      this.onChunkCallback(decoded);
    }

    // Write to storage if writer is available
    if (this.writer) {
      try {
        // Start the file on first chunk
        if (decoded.index === 0) {
          await this.writer.startFile({
            fileId,
            fileName,
            fileSize: totalBytes,
            mimeType: 'application/octet-stream',
          });
        }

        // Write the chunk
        await this.writer.writeChunk(fileId, decoded.index, decoded.data);
      } catch (error) {
        console.error('[FileReceiver] Failed to write chunk:', error);
      }
    }

    // Store the chunk in memory buffer (for verification and fallback)
    let fileChunks = this.chunkBuffers.get(fileId);
    if (!fileChunks) {
      fileChunks = new Map();
      this.chunkBuffers.set(fileId, fileChunks);
    }
    fileChunks.set(decoded.index, decoded.data);

    // Calculate bytes received so far
    const bytesReceived = Array.from(fileChunks.entries()).reduce(
      (sum, [, chunk]) => sum + chunk.byteLength,
      0,
    );
    const fileTotalBytes = this.chunkFileSizes.get(fileId) ?? totalBytes;

    this.emitChunk(fileId, decoded.index, decoded.data, decoded.isLast);
    this.emitProgress(fileId, bytesReceived, fileTotalBytes);

    // If this is the last chunk, try to assemble
    if (decoded.isLast) {
      await this.tryAssemble(fileId);
    }
  }

  /**
   * Try to assemble a file if all chunks are received.
   * For simplicity, we assume the last chunk tells us we can assemble.
   */
  private async tryAssemble(fileId: string): Promise<void> {
    const fileChunks = this.chunkBuffers.get(fileId);
    if (!fileChunks) return;

    const fileName = this.chunkFileNames.get(fileId) ?? fileId;

    // Finalize the writer if available
    if (this.writer) {
      try {
        await this.writer.finalize(fileId);
      } catch (error) {
        console.error('[FileReceiver] Failed to finalize writer:', error);
      }
    }

    // Sort chunks by index and concatenate
    const sortedChunks = Array.from(fileChunks.entries()).sort((a, b) => a[0] - b[0]);

    const totalByteLength = sortedChunks.reduce((sum, [, chunk]) => sum + chunk.byteLength, 0);

    const assembledBuffer = new ArrayBuffer(totalByteLength);
    const assembledBytes = new Uint8Array(assembledBuffer);
    let offset = 0;

    for (const [, chunk] of sortedChunks) {
      assembledBytes.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    this.emitAssembled(fileId, fileName, assembledBuffer.byteLength);

    // Clean up
    this.chunkBuffers.delete(fileId);
    this.chunkFileNames.delete(fileId);
    this.chunkFileSizes.delete(fileId);
  }

  /**
   * Clear all buffered chunks for a file.
   */
  async cancelFile(fileId: string): Promise<void> {
    // Cancel the writer if available
    if (this.writer) {
      try {
        await this.writer.cancel(fileId);
      } catch (error) {
        console.error('[FileReceiver] Failed to cancel writer:', error);
      }
    }

    this.chunkBuffers.delete(fileId);
    this.chunkFileNames.delete(fileId);
    this.chunkFileSizes.delete(fileId);
  }

  /**
   * Clear all buffered chunks.
   */
  clear(): void {
    this.chunkBuffers.clear();
    this.chunkFileNames.clear();
    this.chunkFileSizes.clear();
  }
}
