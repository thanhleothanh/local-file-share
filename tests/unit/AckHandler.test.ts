import { AckHandler, createChunkCache, type ChunkCache } from '@lfs/shared';
import type { ChunkAckMessage } from '@lfs/shared';
import { describe, expect, it, beforeEach } from 'vitest';

describe('AckHandler', () => {
  let cache: ChunkCache;
  let handler: AckHandler;

  beforeEach(() => {
    cache = createChunkCache();
    handler = new AckHandler(cache);
  });

  describe('handle with ChunkAckMessage', () => {
    it('deletes the acknowledged chunk from cache', () => {
      // Add a chunk to the cache
      const fileId = 'file-1';
      const index = 5;
      cache.add(fileId, index, new ArrayBuffer(100));

      // Verify it's in the cache
      expect(cache.get(fileId, index)).not.toBeNull();

      // Handle the ACK
      const message: ChunkAckMessage = {
        type: 'CHUNK_ACK',
        from: 'device-1',
        data: { fileId, index },
      };
      const result = handler.handle(message);

      // Verify the chunk was deleted
      expect(result).toBe(true);
      expect(cache.get(fileId, index)).toBeNull();
    });

    it('returns false when handling ACK for unknown chunk', () => {
      const message: ChunkAckMessage = {
        type: 'CHUNK_ACK',
        from: 'device-1',
        data: { fileId: 'nonexistent', index: 0 },
      };
      const result = handler.handle(message);

      expect(result).toBe(false);
    });

    it('handles multiple ACKs correctly', () => {
      const fileId = 'file-1';

      // Add multiple chunks
      cache.add(fileId, 0, new ArrayBuffer(100));
      cache.add(fileId, 1, new ArrayBuffer(100));
      cache.add(fileId, 2, new ArrayBuffer(100));

      // Handle ACK for chunk 1
      const message1: ChunkAckMessage = {
        type: 'CHUNK_ACK',
        from: 'device-1',
        data: { fileId, index: 1 },
      };
      handler.handle(message1);

      // Verify only chunk 1 is deleted
      expect(cache.get(fileId, 0)).not.toBeNull();
      expect(cache.get(fileId, 1)).toBeNull();
      expect(cache.get(fileId, 2)).not.toBeNull();
    });
  });

  describe('handleAck with explicit fileId and index', () => {
    it('deletes the chunk using explicit parameters', () => {
      const fileId = 'file-1';
      const index = 3;

      cache.add(fileId, index, new ArrayBuffer(100));
      expect(cache.get(fileId, index)).not.toBeNull();

      const result = handler.handleAck(fileId, index);

      expect(result).toBe(true);
      expect(cache.get(fileId, index)).toBeNull();
    });

    it('returns false for unknown chunk', () => {
      const result = handler.handleAck('nonexistent', 0);
      expect(result).toBe(false);
    });
  });

  describe('getCache', () => {
    it('returns the cache instance', () => {
      expect(handler.getCache()).toBe(cache);
    });
  });

  describe('cache with 1000 adds and 1000 deletes ends empty', () => {
    it('handles large number of ACK operations correctly', () => {
      const fileId = 'large-file';

      // Add 1000 chunks
      for (let i = 0; i < 1000; i++) {
        cache.add(fileId, i, new ArrayBuffer(16 * 1024));
      }

      expect(cache.getChunkCount(fileId)).toBe(1000);

      // Handle ACK for all 1000 chunks
      for (let i = 0; i < 1000; i++) {
        const message: ChunkAckMessage = {
          type: 'CHUNK_ACK',
          from: 'device-1',
          data: { fileId, index: i },
        };
        handler.handle(message);
      }

      expect(cache.getChunkCount(fileId)).toBe(0);
    });
  });

  describe('AckHandler with cache containing chunks for indices [3, 7, 42]', () => {
    it('handles NACK for those indices by removing them', () => {
      const fileId = 'file-1';
      const indices = [3, 7, 42];

      // Add chunks at specific indices
      for (const index of indices) {
        cache.add(fileId, index, new ArrayBuffer(100));
      }

      // Add some other chunks that should remain
      cache.add(fileId, 0, new ArrayBuffer(100));
      cache.add(fileId, 1, new ArrayBuffer(100));

      expect(cache.getChunkCount(fileId)).toBe(5);

      // Handle ACK for the specific indices
      for (const index of indices) {
        handler.handleAck(fileId, index);
      }

      // Verify the specific chunks are deleted
      for (const index of indices) {
        expect(cache.get(fileId, index)).toBeNull();
      }

      // Verify other chunks remain
      expect(cache.get(fileId, 0)).not.toBeNull();
      expect(cache.get(fileId, 1)).not.toBeNull();
      expect(cache.getChunkCount(fileId)).toBe(2);
    });
  });
});
