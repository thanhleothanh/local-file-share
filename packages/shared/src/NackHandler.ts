/**
 * NackHandler handles CHUNK_REQUEST_NACK messages from the receiver.
 * It manages retransmission of missing chunks from the sender's cache.
 */

import type { ChunkCache } from './ChunkCache.js';
import type { ChunkRequestNackData, ChunkRequestNackMessage } from './ControlMessageTypes.js';
import { MAX_NACK_ROUNDS } from './Constants.js';

/**
 * Interface for a sender that can retransmit chunks.
 */
export interface ChunkSender {
  /**
   * Send a chunk on the data channel.
   * @param fileId - The file ID
   * @param index - The chunk index
   * @param data - The chunk data
   * @returns Promise that resolves when the chunk is sent
   */
  sendChunk(fileId: string, index: number, data: ArrayBuffer): Promise<void>;
}

/**
 * Handler for CHUNK_REQUEST_NACK messages.
 * Called by the sender when a CHUNK_REQUEST_NACK message is received on the control channel.
 */
export class NackHandler {
  private readonly cache: ChunkCache;
  private readonly sender: ChunkSender;

  constructor(cache: ChunkCache, sender: ChunkSender) {
    this.cache = cache;
    this.sender = sender;
  }

  /**
   * Handle an incoming CHUNK_REQUEST_NACK message.
   * Retrieves the missing chunks from the cache and retransmits them.
   *
   * @param message - The CHUNK_REQUEST_NACK message containing fileId and missingIndices
   * @returns Array of indices that were successfully retransmitted
   */
  async handle(message: ChunkRequestNackMessage): Promise<number[]> {
    const data = message.data as ChunkRequestNackData;
    const { fileId, missingIndices, round } = data;

    const retransmitted: number[] = [];

    // Check if we've exceeded the maximum NACK rounds
    if (round >= MAX_NACK_ROUNDS) {
      console.warn('[NackHandler] Maximum NACK rounds exceeded, file should be marked FAILED', {
        fileId,
        round,
      });
      return retransmitted;
    }

    // Retransmit each missing chunk
    for (const index of missingIndices) {
      const chunkData = this.cache.get(fileId, index);
      if (chunkData) {
        await this.sender.sendChunk(fileId, index, chunkData);
        retransmitted.push(index);
      } else {
        console.warn('[NackHandler] Missing chunk not in cache, cannot retransmit', { fileId, index });
        // The sender should send CHUNK_REQUEST_FAILED if the chunk is not in cache
      }
    }

    return retransmitted;
  }

  /**
   * Handle a NACK with explicit data (alternative API for when message is already parsed).
   *
   * @param fileId - The file ID
   * @param missingIndices - The list of missing chunk indices
   * @param round - The current NACK round (0-indexed)
   * @returns Array of indices that were successfully retransmitted
   */
  async handleNack(fileId: string, missingIndices: number[], round: number = 0): Promise<number[]> {
    const message: ChunkRequestNackMessage = {
      type: 'CHUNK_REQUEST_NACK',
      from: '',
      data: { fileId, missingIndices, round },
    };
    return this.handle(message);
  }

  /**
   * Get the cache being managed by this handler.
   */
  getCache(): ChunkCache {
    return this.cache;
  }

  /**
   * Get the sender being used by this handler.
   */
  getSender(): ChunkSender {
    return this.sender;
  }
}
