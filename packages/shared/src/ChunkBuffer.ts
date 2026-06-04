/**
 * ChunkBuffer manages received chunks for file reassembly and integrity checking.
 * Used by the receiver to buffer chunks until all are received or to detect missing chunks.
 */

export interface ChunkBuffer {
  /**
   * Add a chunk to the buffer.
   * @param fileId - The file ID
   * @param index - The chunk index
   * @param data - The chunk data
   * @param isLast - Whether this is the last chunk
   */
  add(fileId: string, index: number, data: ArrayBuffer, isLast: boolean): void;

  /**
   * Check if all indices for a file are present.
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks expected
   * @returns true if all chunks are present
   */
  hasAllIndices(fileId: string, totalChunks: number): boolean;

  /**
   * Get the list of missing chunk indices.
   * @param fileId - The file ID
   * @param totalChunks - The total number of chunks expected
   * @returns Array of missing chunk indices
   */
  missingIndices(fileId: string, totalChunks: number): number[];

  /**
   * Assemble the file from all buffered chunks.
   * @param fileId - The file ID
   * @returns The assembled file as an ArrayBuffer
   */
  assemble(fileId: string): ArrayBuffer;

  /**
   * Delete all chunks for a file.
   * @param fileId - The file ID
   */
  deleteFile(fileId: string): void;

  /**
   * Get the total byte size of buffered chunks for a file.
   * @param fileId - The file ID
   * @returns Total byte size
   */
  getByteSize(fileId: string): number;

  /**
   * Get the number of chunks buffered for a file.
   * @param fileId - The file ID
   * @returns Number of chunks
   */
  getChunkCount(fileId: string): number;

  /**
   * Check if a specific chunk exists in the buffer.
   * @param fileId - The file ID
   * @param index - The chunk index
   * @returns true if the chunk exists
   */
  has(fileId: string, index: number): boolean;

  /**
   * Get a specific chunk from the buffer.
   * @param fileId - The file ID
   * @param index - The chunk index
   * @returns The chunk data or null if not found
   */
  get(fileId: string, index: number): ArrayBuffer | null;
}

/**
 * Default implementation of ChunkBuffer using nested Maps.
 */
export class DefaultChunkBuffer implements ChunkBuffer {
  // fileId -> Map of index -> ArrayBuffer
  private readonly buffers: Map<string, Map<number, ArrayBuffer>> = new Map();

  add(fileId: string, index: number, data: ArrayBuffer, _isLast: boolean): void {
    let fileChunks = this.buffers.get(fileId);
    if (!fileChunks) {
      fileChunks = new Map();
      this.buffers.set(fileId, fileChunks);
    }
    fileChunks.set(index, data);
  }

  hasAllIndices(fileId: string, totalChunks: number): boolean {
    const fileChunks = this.buffers.get(fileId);
    if (!fileChunks) return false;

    // Check if we have all chunks from 0 to totalChunks - 1
    for (let i = 0; i < totalChunks; i++) {
      if (!fileChunks.has(i)) {
        return false;
      }
    }
    return true;
  }

  missingIndices(fileId: string, totalChunks: number): number[] {
    const fileChunks = this.buffers.get(fileId);

    // If no file chunks exist, all indices are missing
    if (!fileChunks || fileChunks.size === 0) {
      return Array.from({ length: totalChunks }, (_, i) => i);
    }

    const missing: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!fileChunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  assemble(fileId: string): ArrayBuffer {
    const fileChunks = this.buffers.get(fileId);
    if (!fileChunks) return new ArrayBuffer(0);

    // Sort chunks by index
    const sortedChunks = Array.from(fileChunks.entries()).sort((a, b) => a[0] - b[0]);

    // Calculate total byte length
    const totalByteLength = sortedChunks.reduce((sum, [, chunk]) => sum + chunk.byteLength, 0);

    // Concatenate all chunks
    const assembledBuffer = new ArrayBuffer(totalByteLength);
    const assembledBytes = new Uint8Array(assembledBuffer);
    let offset = 0;

    for (const [, chunk] of sortedChunks) {
      assembledBytes.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return assembledBuffer;
  }

  deleteFile(fileId: string): void {
    this.buffers.delete(fileId);
  }

  getByteSize(fileId: string): number {
    const fileChunks = this.buffers.get(fileId);
    if (!fileChunks) return 0;

    let size = 0;
    for (const chunk of fileChunks.values()) {
      size += chunk.byteLength;
    }
    return size;
  }

  getChunkCount(fileId: string): number {
    const fileChunks = this.buffers.get(fileId);
    return fileChunks?.size ?? 0;
  }

  has(fileId: string, index: number): boolean {
    const fileChunks = this.buffers.get(fileId);
    if (!fileChunks) return false;
    return fileChunks.has(index);
  }

  get(fileId: string, index: number): ArrayBuffer | null {
    const fileChunks = this.buffers.get(fileId);
    if (!fileChunks) return null;
    return fileChunks.get(index) ?? null;
  }

  /**
   * Clear all buffers.
   */
  clear(): void {
    this.buffers.clear();
  }
}

/**
 * Create a new DefaultChunkBuffer instance.
 */
export function createChunkBuffer(): ChunkBuffer {
  return new DefaultChunkBuffer();
}
