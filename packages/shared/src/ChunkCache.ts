/**
 * ChunkCache manages cached chunks for in-flight file transfers.
 * Used by the sender to retain chunks until they are acknowledged by the receiver.
 * This bounds memory usage to throughput × RTT rather than file size.
 */

export interface ChunkCache {
  /**
   * Add a chunk to the cache.
   */
  add(fileId: string, index: number, data: ArrayBuffer): void;

  /**
   * Get a chunk from the cache.
   * Returns null if the chunk is not in the cache.
   */
  get(fileId: string, index: number): ArrayBuffer | null;

  /**
   * Delete a specific chunk from the cache.
   */
  delete(fileId: string, index: number): boolean;

  /**
   * Delete all chunks for a given file.
   */
  deleteFile(fileId: string): void;

  /**
   * Get the number of chunks currently cached for a file.
   */
  getChunkCount(fileId: string): number;

  /**
   * Get the total number of chunks across all files.
   */
  getTotalChunkCount(): number;

  /**
   * Get the total byte size of all cached chunks for a file.
   */
  getByteSize(fileId: string): number;

  /**
   * Get the total byte size across all files.
   */
  getTotalByteSize(): number;

  /**
   * Check if a specific chunk exists in the cache.
   */
  has(fileId: string, index: number): boolean;

  /**
   * Clear all chunks from the cache.
   */
  clear(): void;
}

/**
 * Default implementation of ChunkCache using nested Maps.
 * Inner map: index -> ArrayBuffer for each file
 * Outer map: fileId -> inner map
 */
export class DefaultChunkCache implements ChunkCache {
  // fileId -> (index -> ArrayBuffer)
  private readonly cache: Map<string, Map<number, ArrayBuffer>> = new Map();

  add(fileId: string, index: number, data: ArrayBuffer): void {
    let fileChunks = this.cache.get(fileId);
    if (!fileChunks) {
      fileChunks = new Map();
      this.cache.set(fileId, fileChunks);
    }
    fileChunks.set(index, data);
  }

  get(fileId: string, index: number): ArrayBuffer | null {
    const fileChunks = this.cache.get(fileId);
    if (!fileChunks) return null;
    return fileChunks.get(index) ?? null;
  }

  delete(fileId: string, index: number): boolean {
    const fileChunks = this.cache.get(fileId);
    if (!fileChunks) return false;
    return fileChunks.delete(index);
  }

  deleteFile(fileId: string): void {
    this.cache.delete(fileId);
  }

  getChunkCount(fileId: string): number {
    const fileChunks = this.cache.get(fileId);
    return fileChunks?.size ?? 0;
  }

  getTotalChunkCount(): number {
    let count = 0;
    for (const fileChunks of this.cache.values()) {
      count += fileChunks.size;
    }
    return count;
  }

  getByteSize(fileId: string): number {
    const fileChunks = this.cache.get(fileId);
    if (!fileChunks) return 0;
    let size = 0;
    for (const chunk of fileChunks.values()) {
      size += chunk.byteLength;
    }
    return size;
  }

  getTotalByteSize(): number {
    let size = 0;
    for (const fileChunks of this.cache.values()) {
      for (const chunk of fileChunks.values()) {
        size += chunk.byteLength;
      }
    }
    return size;
  }

  has(fileId: string, index: number): boolean {
    const fileChunks = this.cache.get(fileId);
    if (!fileChunks) return false;
    return fileChunks.has(index);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Create a new DefaultChunkCache instance.
 * This is the recommended way to create a ChunkCache.
 */
export function createChunkCache(): ChunkCache {
  return new DefaultChunkCache();
}
