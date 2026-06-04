import { createChunkCache, NackHandler, MAX_NACK_ROUNDS, type ChunkSender, type ChunkCache } from '@lfs/shared';
import type { ChunkRequestNackMessage } from '@lfs/shared';
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock ChunkSender implementation
class MockChunkSender implements ChunkSender {
  private readonly sentChunks: Array<{ fileId: string; index: number; data: ArrayBuffer }> = [];

  constructor(private readonly cache: ChunkCache) {}

  async sendChunk(fileId: string, index: number, data: ArrayBuffer): Promise<void> {
    this.sentChunks.push({ fileId, index, data });
  }

  getSentChunks(): Array<{ fileId: string; index: number; data: ArrayBuffer }> {
    return this.sentChunks;
  }

  clear(): void {
    this.sentChunks.length = 0;
  }
}

describe('NackHandler', () => {
  let cache: ChunkCache;
  let sender: MockChunkSender;
  let handler: NackHandler;

  beforeEach(() => {
    cache = createChunkCache();
    sender = new MockChunkSender(cache);
    handler = new NackHandler(cache, sender);
  });

  describe('handle with ChunkRequestNackMessage', () => {
    it('retransmits chunks from cache', async () => {
      const fileId = 'file-1';

      // Add chunks to cache
      cache.add(fileId, 3, new ArrayBuffer(100));
      cache.add(fileId, 7, new ArrayBuffer(100));
      cache.add(fileId, 42, new ArrayBuffer(100));

      // Handle NACK for these indices
      const message: ChunkRequestNackMessage = {
        type: 'CHUNK_REQUEST_NACK',
        from: 'receiver',
        data: { fileId, missingIndices: [3, 7, 42], round: 0 },
      };

      const retransmitted = await handler.handle(message);

      expect(retransmitted).toEqual([3, 7, 42]);
      expect(sender.getSentChunks().length).toBe(3);
    });

    it('handles NACK for unknown indices (not in cache)', async () => {
      const fileId = 'file-1';

      // Add only chunk 3 to cache
      cache.add(fileId, 3, new ArrayBuffer(100));

      // Request chunks 3, 7, 42 but only 3 is in cache
      const message: ChunkRequestNackMessage = {
        type: 'CHUNK_REQUEST_NACK',
        from: 'receiver',
        data: { fileId, missingIndices: [3, 7, 42], round: 0 },
      };

      const retransmitted = await handler.handle(message);

      // Only chunk 3 should be retransmitted
      expect(retransmitted).toEqual([3]);
      expect(sender.getSentChunks().length).toBe(1);
    });

    it('does not retransmit when max rounds exceeded', async () => {
      const fileId = 'file-1';

      // Add chunk to cache
      cache.add(fileId, 0, new ArrayBuffer(100));

      // Request with round >= MAX_NACK_ROUNDS
      const message: ChunkRequestNackMessage = {
        type: 'CHUNK_REQUEST_NACK',
        from: 'receiver',
        data: { fileId, missingIndices: [0], round: MAX_NACK_ROUNDS },
      };

      const retransmitted = await handler.handle(message);

      expect(retransmitted).toEqual([]);
      expect(sender.getSentChunks().length).toBe(0);
    });
  });

  describe('handleNack with explicit parameters', () => {
    it('retransmits using explicit fileId, missingIndices, and round', async () => {
      const fileId = 'file-1';

      // Add chunks to cache
      cache.add(fileId, 5, new ArrayBuffer(100));
      cache.add(fileId, 10, new ArrayBuffer(100));

      const retransmitted = await handler.handleNack(fileId, [5, 10], 0);

      expect(retransmitted).toEqual([5, 10]);
      expect(sender.getSentChunks().length).toBe(2);
    });

    it('defaults round to 0', async () => {
      const fileId = 'file-1';
      cache.add(fileId, 0, new ArrayBuffer(100));

      const retransmitted = await handler.handleNack(fileId, [0]);

      expect(retransmitted).toEqual([0]);
    });
  });

  describe('getCache and getSender', () => {
    it('getCache returns the cache instance', () => {
      expect(handler.getCache()).toBe(cache);
    });

    it('getSender returns the sender instance', () => {
      expect(handler.getSender()).toBe(sender);
    });
  });

  describe('NackHandler with cache containing chunks for indices [3, 7, 42]', () => {
    it('handles NACK for those indices by retransmitting them', async () => {
      const fileId = 'file-1';
      const indices = [3, 7, 42];

      // Add chunks at specific indices
      for (const index of indices) {
        cache.add(fileId, index, new ArrayBuffer(100));
      }

      const message: ChunkRequestNackMessage = {
        type: 'CHUNK_REQUEST_NACK',
        from: 'receiver',
        data: { fileId, missingIndices: indices, round: 0 },
      };

      const retransmitted = await handler.handle(message);

      expect(retransmitted).toEqual(indices);
      expect(sender.getSentChunks().length).toBe(3);
    });
  });

  describe('drop-simulation test', () => {
    it('sender sends 100 chunks, receiver drops 5, receiver sends NACK, sender retransmits from cache', async () => {
      const fileId = 'file-1';
      const chunkCount = 100;

      // Simulate sender: add all 100 chunks to cache
      for (let i = 0; i < chunkCount; i++) {
        cache.add(fileId, i, new ArrayBuffer(16 * 1024));
      }

      // Simulate receiver drops chunks 10, 20, 30, 40, 50
      const droppedIndices = [10, 20, 30, 40, 50];

      // Receiver sends NACK for dropped indices
      const message: ChunkRequestNackMessage = {
        type: 'CHUNK_REQUEST_NACK',
        from: 'receiver',
        data: { fileId, missingIndices: droppedIndices, round: 0 },
      };

      const retransmitted = await handler.handle(message);

      expect(retransmitted.sort((a, b) => a - b)).toEqual(droppedIndices);
      expect(sender.getSentChunks().length).toBe(5);
    });
  });

  describe('MAX_NACK_ROUNDS', () => {
    it('is set to 3', () => {
      expect(MAX_NACK_ROUNDS).toBe(3);
    });
  });
});
