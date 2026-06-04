/**
 * AckHandler handles CHUNK_ACK messages from the receiver.
 * It manages the ChunkCache, deleting acknowledged chunks.
 */

import type { ChunkCache } from './ChunkCache.js';
import type { ChunkAckData, ChunkAckMessage } from './ControlMessageTypes.js';

/**
 * Handler for CHUNK_ACK messages.
 * Called by the sender when a CHUNK_ACK message is received on the control channel.
 */
export class AckHandler {
  private readonly cache: ChunkCache;

  constructor(cache: ChunkCache) {
    this.cache = cache;
  }

  /**
   * Handle an incoming CHUNK_ACK message.
   * Deletes the acknowledged chunk from the cache.
   *
   * @param message - The CHUNK_ACK message containing fileId and index
   * @returns true if the chunk was in the cache and deleted, false otherwise
   */
  handle(message: ChunkAckMessage): boolean {
    const data = message.data as ChunkAckData;
    const { fileId, index } = data;

    return this.cache.delete(fileId, index);
  }

  /**
   * Handle an ACK with explicit data (alternative API for when message is already parsed).
   *
   * @param fileId - The file ID
   * @param index - The chunk index
   * @returns true if the chunk was in the cache and deleted, false otherwise
   */
  handleAck(fileId: string, index: number): boolean {
    return this.cache.delete(fileId, index);
  }

  /**
   * Get the cache being managed by this handler.
   */
  getCache(): ChunkCache {
    return this.cache;
  }
}
