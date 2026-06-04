import { CHUNK_SIZE, generateUuid } from '@lfs/shared';
import { encodeChunk } from '@lfs/shared';

export interface FileSenderOptions {
  sendChunk: (chunk: ArrayBuffer) => Promise<void>;
}

export interface FileSenderEvents {
  progress: (fileId: string, bytesSent: number, totalBytes: number) => void;
}

export class FileSender {
  private readonly sendChunk: (chunk: ArrayBuffer) => Promise<void>;
  private readonly listeners: Array<(fileId: string, bytesSent: number, totalBytes: number) => void> = [];

  constructor(options: FileSenderOptions) {
    this.sendChunk = options.sendChunk;
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
   * Send a file over the data channel.
   * Slices the file into chunks, encodes each with ChunkCodec, and sends via sendChunk.
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

      bytesSent += chunkData.byteLength;
      this.emitProgress(fileId, bytesSent, totalBytes);
    }
  }
}
