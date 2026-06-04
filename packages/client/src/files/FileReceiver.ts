import type { DecodedChunk } from '@lfs/shared';
import { decodeChunk } from '@lfs/shared';

export interface FileReceiverEvents {
  chunk: (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
  assembled: (fileId: string, fileName: string, byteLength: number) => void;
}

export interface FileReceiverOptions {
  onChunkCallback?: (chunk: DecodedChunk) => void;
}

type ChunkHandler = (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
type AssembledHandler = (fileId: string, fileName: string, byteLength: number) => void;

export class FileReceiver {
  // Map of fileId -> Map of index -> ArrayBuffer
  private readonly chunkBuffers: Map<string, Map<number, ArrayBuffer>> = new Map();
  private readonly chunkFileNames: Map<string, string> = new Map();
  private readonly chunkListeners: ChunkHandler[] = [];
  private readonly assembledListeners: AssembledHandler[] = [];
  private readonly onChunkCallback: ((chunk: DecodedChunk) => void) | undefined;

  constructor(options: FileReceiverOptions = {}) {
    this.onChunkCallback = options.onChunkCallback;
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

  /**
   * Handle an incoming raw chunk (encoded with header).
   * Decodes it and stores it in the buffer.
   */
  handleChunk(fileId: string, fileName: string, rawChunk: ArrayBuffer): void {
    const decoded = decodeChunk(rawChunk);

    // Store the filename for this fileId if not already stored
    if (!this.chunkFileNames.has(fileId)) {
      this.chunkFileNames.set(fileId, fileName);
    }

    // Call optional chunk callback
    if (this.onChunkCallback) {
      this.onChunkCallback(decoded);
    }

    // Store the chunk
    let fileChunks = this.chunkBuffers.get(fileId);
    if (!fileChunks) {
      fileChunks = new Map();
      this.chunkBuffers.set(fileId, fileChunks);
    }
    fileChunks.set(decoded.index, decoded.data);

    this.emitChunk(fileId, decoded.index, decoded.data, decoded.isLast);

    // If this is the last chunk, try to assemble
    if (decoded.isLast) {
      this.tryAssemble(fileId);
    }
  }

  /**
   * Try to assemble a file if all chunks are received.
   * For simplicity, we assume the last chunk tells us we can assemble.
   */
  private tryAssemble(fileId: string): void {
    const fileChunks = this.chunkBuffers.get(fileId);
    if (!fileChunks) return;

    const fileName = this.chunkFileNames.get(fileId) ?? fileId;

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
  }

  /**
   * Clear all buffered chunks for a file.
   */
  cancelFile(fileId: string): void {
    this.chunkBuffers.delete(fileId);
    this.chunkFileNames.delete(fileId);
  }

  /**
   * Clear all buffered chunks.
   */
  clear(): void {
    this.chunkBuffers.clear();
    this.chunkFileNames.clear();
  }
}
