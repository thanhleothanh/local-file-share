import type { DecodedChunk, ChunkBuffer, FileIntegrityChecker } from '@lfs/shared';
import { decodeChunk, createChunkBuffer, FileIntegrityChecker as SharedFileIntegrityChecker } from '@lfs/shared';
import type { FileSystemWriter } from './FileSystemWriter.js';

export interface FileReceiverEvents {
  chunk: (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
  assembled: (fileId: string, fileName: string, byteLength: number) => void;
  progress: (fileId: string, bytesReceived: number, totalBytes: number) => void;
  /**
   * Called when a NACK needs to be sent for missing chunks.
   */
  sendNack?: (fileId: string, totalChunks: number, round: number) => void;
}

export interface FileReceiverOptions {
  onChunkCallback?: (chunk: DecodedChunk) => void;
  writer?: FileSystemWriter | undefined;
  /**
   * Callback to send CHUNK_ACK messages on the control channel.
   * This is called for every chunk received to acknowledge it to the sender.
   */
  sendChunkAck?: (fileId: string, index: number) => void;
  /**
   * Callback to send CHUNK_REQUEST_NACK messages on the control channel.
   * Called when missing chunks are detected after receiving TRANSFER_DONE.
   */
  sendChunkNack?: (fileId: string, missingIndices: number[], round: number) => void;
  /**
   * Callback to send FILE_RECEIVED message on the control channel.
   * Called when the file integrity check passes.
   */
  sendFileReceived?: (fileId: string, totalChunks: number) => void;
  /**
   * Custom ChunkBuffer to use. If not provided, a DefaultChunkBuffer is created.
   */
  buffer?: ChunkBuffer;
}

type ChunkHandler = (fileId: string, index: number, data: ArrayBuffer, isLast: boolean) => void;
type AssembledHandler = (fileId: string, fileName: string, byteLength: number) => void;
type ProgressHandler = (fileId: string, bytesReceived: number, totalBytes: number) => void;

export class FileReceiver {
  // Map of fileId -> Map of index -> ArrayBuffer
  private readonly chunkFileNames: Map<string, string> = new Map();
  private readonly chunkFileSizes: Map<string, number> = new Map();
  private readonly chunkFileTotalChunks: Map<string, number> = new Map();
  private readonly chunkListeners: ChunkHandler[] = [];
  private readonly assembledListeners: AssembledHandler[] = [];
  private readonly progressListeners: ProgressHandler[] = [];
  private readonly onChunkCallback: ((chunk: DecodedChunk) => void) | undefined;
  private readonly writer: FileSystemWriter | undefined;
  private readonly sendChunkAck: ((fileId: string, index: number) => void) | undefined;
  private readonly sendChunkNack: ((fileId: string, missingIndices: number[], round: number) => void) | undefined;
  private readonly sendFileReceived: ((fileId: string, totalChunks: number) => void) | undefined;
  private readonly buffer: ChunkBuffer;
  private readonly integrityChecker: FileIntegrityChecker;
  private readonly pendingTransfers: Map<string, number> = new Map(); // fileId -> round

  constructor(options: FileReceiverOptions = {}) {
    this.onChunkCallback = options.onChunkCallback;
    this.writer = options.writer;
    this.sendChunkAck = options.sendChunkAck;
    this.sendChunkNack = options.sendChunkNack;
    this.sendFileReceived = options.sendFileReceived;
    this.buffer = options.buffer ?? createChunkBuffer();
    this.integrityChecker = new SharedFileIntegrityChecker(this.buffer);
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
   * Sends CHUNK_ACK on the control channel for every chunk received.
   *
   * @param fileId - The file ID
   * @param fileName - The filename
   * @param totalBytes - The total file size in bytes
   * @param rawChunk - The encoded chunk data
   * @param totalChunks - The total number of chunks (optional, used for integrity checking)
   */
  async handleChunk(
    fileId: string,
    fileName: string,
    totalBytes: number,
    rawChunk: ArrayBuffer,
    totalChunks?: number,
  ): Promise<void> {
    const decoded = decodeChunk(rawChunk);

    // Store the filename, total bytes, and total chunks for this fileId if not already stored
    if (!this.chunkFileNames.has(fileId)) {
      this.chunkFileNames.set(fileId, fileName);
      this.chunkFileSizes.set(fileId, totalBytes);
      if (totalChunks !== undefined) {
        this.chunkFileTotalChunks.set(fileId, totalChunks);
      } else {
        // If totalChunks is not provided, calculate it from totalBytes
        // This is a fallback for backward compatibility
        const chunkSize = 16384; // From Constants.CHUNK_SIZE
        this.chunkFileTotalChunks.set(fileId, Math.ceil(totalBytes / chunkSize));
      }
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

    // Store the chunk in the ChunkBuffer
    this.buffer.add(fileId, decoded.index, decoded.data, decoded.isLast);

    // Send CHUNK_ACK for this chunk on the control channel
    // This acknowledges receipt to the sender
    if (this.sendChunkAck) {
      this.sendChunkAck(fileId, decoded.index);
    }

    // Calculate bytes received so far
    const bytesReceived = this.buffer.getByteSize(fileId);
    const fileTotalBytes = this.chunkFileSizes.get(fileId) ?? totalBytes;

    this.emitChunk(fileId, decoded.index, decoded.data, decoded.isLast);
    this.emitProgress(fileId, bytesReceived, fileTotalBytes);

    // If this is the last chunk, try to assemble
    if (decoded.isLast) {
      await this.tryAssemble(fileId);
    }
  }

  /**
   * Handle TRANSFER_DONE message from sender.
   * Performs integrity check and sends CHUNK_REQUEST_NACK if chunks are missing,
   * or FILE_RECEIVED if all chunks are present.
   *
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks sent by the sender
   * @returns true if the file is complete and FILE_RECEIVED was sent, false otherwise
   */
  async handleTransferDone(fileId: string, totalChunks: number): Promise<boolean> {
    // Get the current round (starts at 0)
    const currentRound = this.pendingTransfers.get(fileId) ?? 0;

    // Perform integrity check
    const result = this.integrityChecker.check(fileId, totalChunks);

    if (result.complete) {
      // All chunks received - send FILE_RECEIVED
      console.info('[FileReceiver] All chunks received, sending FILE_RECEIVED', { fileId, totalChunks });
      if (this.sendFileReceived) {
        this.sendFileReceived(fileId, totalChunks);
      }
      
      // Finalize the writer if available
      if (this.writer) {
        try {
          await this.writer.finalize(fileId);
        } catch (error) {
          console.error('[FileReceiver] Failed to finalize writer:', error);
        }
      }
      
      // Assemble and emit the file
      await this.finalizeAssemble(fileId);
      
      // Clean up tracking
      this.pendingTransfers.delete(fileId);
      
      return true;
    } else {
      // Missing chunks detected - send CHUNK_REQUEST_NACK
      console.info('[FileReceiver] Missing chunks detected, sending CHUNK_REQUEST_NACK', {
        fileId,
        totalChunks,
        missingIndices: result.missingIndices,
        round: currentRound,
      });
      
      if (this.sendChunkNack) {
        this.sendChunkNack(fileId, result.missingIndices, currentRound);
      }
      
      // Increment round counter
      this.pendingTransfers.set(fileId, currentRound + 1);
      
      return false;
    }
  }

  /**
   * Try to assemble a file if all chunks are received.
   * This is called when the last chunk is received.
   * For backward compatibility with tests, we emit the assembled event here,
   * but the actual integrity check and FILE_RECEIVED message happen in handleTransferDone.
   */
  private async tryAssemble(fileId: string): Promise<void> {
    const fileName = this.chunkFileNames.get(fileId) ?? fileId;
    const fileChunks = this.buffer.getChunkCount(fileId);
    
    if (fileChunks === 0) {
      console.warn('[FileReceiver] Cannot assemble file with no chunks', { fileId });
      return;
    }

    // Get the assembled buffer from ChunkBuffer
    const assembledBuffer = this.buffer.assemble(fileId);

    // Emit the assembled event for backward compatibility
    // Note: The actual file completion (FILE_RECEIVED) is sent in handleTransferDone
    this.emitAssembled(fileId, fileName, assembledBuffer.byteLength);
  }

  /**
   * Finalize assembly after integrity check passes.
   */
  private async finalizeAssemble(fileId: string): Promise<void> {
    const fileName = this.chunkFileNames.get(fileId) ?? fileId;
    const fileChunks = this.buffer.getChunkCount(fileId);
    
    if (fileChunks === 0) {
      console.warn('[FileReceiver] Cannot assemble file with no chunks', { fileId });
      return;
    }

    // Get the assembled buffer from ChunkBuffer
    const assembledBuffer = this.buffer.assemble(fileId);

    this.emitAssembled(fileId, fileName, assembledBuffer.byteLength);

    // Clean up the buffer for this file
    this.buffer.deleteFile(fileId);
    this.chunkFileNames.delete(fileId);
    this.chunkFileSizes.delete(fileId);
    this.chunkFileTotalChunks.delete(fileId);
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

    this.buffer.deleteFile(fileId);
    this.chunkFileNames.delete(fileId);
    this.chunkFileSizes.delete(fileId);
    this.chunkFileTotalChunks.delete(fileId);
    this.pendingTransfers.delete(fileId);
  }

  /**
   * Clear all buffered chunks.
   */
  clear(): void {
    // Clear all files from the buffer
    const fileIds = Array.from(this.chunkFileNames.keys());
    for (const fileId of fileIds) {
      this.buffer.deleteFile(fileId);
    }
    this.chunkFileNames.clear();
    this.chunkFileSizes.clear();
    this.chunkFileTotalChunks.clear();
    this.pendingTransfers.clear();
  }

  /**
   * Get the ChunkBuffer used by this receiver.
   */
  getBuffer(): ChunkBuffer {
    return this.buffer;
  }

  /**
   * Get the FileIntegrityChecker used by this receiver.
   */
  getIntegrityChecker(): FileIntegrityChecker {
    return this.integrityChecker;
  }
}
